// /api/v1/forecast 오케스트레이션 — 서버 전용.
// 시계열: regional_drought_daily 최근 90일 → 실패 시 커밋 스냅샷(stale=true).
// 예측선·밴드 = 백테스트 채택 모델 + 잔차 p25/p75×지역 bandScale(data/backtest-report.json),
// 추세·도달일 = 최근 14일 관측 OLS 기울기(observedDailyDelta) — 근거 분리
// (docs/prediction-model.md "d의 정의(2026-07-22 확정)").
// 참고 표현만: 숫자·버킷·단계만 반환하고 문장을 만들지 않는다(AGENTS.md 규칙 3).
import type { DroughtStage, ForecastResponse } from "@mulsigye/contracts";
import { STAGE_ACTIONS } from "@mulsigye/llm";
import { z } from "zod";
import {
  STAGE_LABEL_BY_CODE,
  stageCodeFromAvgRatio,
  stageCodeFromLabel,
  outlookLabelFromCode,
  STAGE_CODE_BY_LABEL,
  type DroughtStageCode,
} from "../data/drought-stage.ts";
import type { RegionEstimate } from "../data/region-estimate.ts";
import { fetchRegionEstimateSeries } from "../data/region-estimate-series.ts";
import {
  resolveRegion,
  type RegionResolverDeps,
} from "../data/region-resolver.ts";
import {
  REGION_ESTIMATE_SOURCE,
  type RegionalSnapshotRow,
} from "../data/status-service.ts";
import { createServiceRoleClient } from "../data/supabase-server.ts";
import type { WaterLevelApiDeps } from "../data/waterlevel-api.ts";
import {
  backtestReportSchema,
  type BacktestReport,
} from "./backtest-report.ts";
import {
  MODEL_MIN_INPUT_DAYS,
  OBSERVED_TREND_WINDOW_DAYS,
  observedDailyDelta,
  predict,
} from "./models.ts";
import { daysToNextStage, toReachBucket, toTrendBucket } from "./reach.ts";
import backtestReportJson from "../../../../../data/backtest-report.json" with { type: "json" };
import outlooksSnapshotJson from "../../../../../data/snapshots/official-outlooks.json" with { type: "json" };
import regionalSnapshotJson from "../../../../../data/snapshots/regional-drought-daily.json" with { type: "json" };

export const DROUGHT_MAP_SOURCE = "논가뭄지도";
export const OFFICIAL_OUTLOOK_SOURCE = "가뭄예경보자료";

/** 커밋 스냅샷 폴백 사용 시 sources에 스냅샷 기준일을 명시한다(status-service와 동일 규칙). */
export function committedSnapshotSource(observedOn: string): string {
  return `커밋 스냅샷(기준 ${observedOn})`;
}

/** Supabase 시계열 조회 창(일). 예측 입력(최소 14일)보다 넉넉히 가져온다. */
export const SERIES_LOOKBACK_DAYS = 90;

/** 응답에 담는 실측 구간 길이(일). 차트가 앞뒤로 최소 한 달씩 보이도록 60일을 준다. */
export const HISTORY_DAYS = 60;

/** 실제 Supabase 클라이언트와 테스트 mock이 공유하는 최소 조회 표면. */
export type ForecastSupabaseClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(
          column: string,
          options: { ascending: boolean },
        ): {
          limit(count: number): PromiseLike<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

export type OutlookSnapshotRow = {
  publishedOn: string;
  sidoName: string;
  sigunName: string;
  sigunCode: string;
  currentLevel: number;
  outlook1m: number;
  outlook2m: number;
  outlook3m: number;
};

export type ForecastServiceDeps = {
  /** 조회 시점에 생성 — 생성 실패도 조회 실패로 취급해 스냅샷으로 폴백한다. */
  createClient?: () => ForecastSupabaseClient;
  resolver?: RegionResolverDeps;
  /** 추정 시계열 조회용 — status와 같은 창을 부르므로 fetch 캐시를 공유한다. */
  waterLevel?: WaterLevelApiDeps;
  snapshotRegional?: readonly RegionalSnapshotRow[];
  snapshotOutlooks?: readonly OutlookSnapshotRow[];
  report?: BacktestReport;
  now?: () => Date;
};

export type ForecastResult =
  | { kind: "ok"; body: ForecastResponse }
  | { kind: "not_prepared" }
  | { kind: "unavailable" };

const REGIONAL_SNAPSHOT: readonly RegionalSnapshotRow[] = regionalSnapshotJson;
const OUTLOOKS_SNAPSHOT: readonly OutlookSnapshotRow[] = outlooksSnapshotJson;

/** 커밋된 리포트는 로드 시 스키마로 검증한다 — 깨진 리포트로 서비스하지 않는다. */
const BACKTEST_REPORT: BacktestReport =
  backtestReportSchema.parse(backtestReportJson);

const seriesRowSchema = z.object({
  observed_on: z.string().min(1),
  avg_ratio: z.coerce.number(),
  official_stage: z.string().nullish(),
});

const outlookRowSchema = z.object({
  published_on: z.string().min(1),
  current_level: z.coerce.number(),
  outlook_1m: z.coerce.number(),
  outlook_2m: z.coerce.number(),
  outlook_3m: z.coerce.number(),
});

type SeriesPoint = {
  observedOn: string;
  avgRatio: number;
  officialStage: string | null;
};

type OfficialOutlook = NonNullable<ForecastResponse["officialOutlook"]>;

/** 현재 단계의 다음(더 나쁜) 단계. 심각은 다음 단계가 없다. */
const NEXT_STAGE_CODE: Partial<Record<DroughtStageCode, DroughtStageCode>> = {
  ok: "watch",
  watch: "care",
  care: "alert",
  alert: "crit",
};

function toStageDto(code: DroughtStageCode): DroughtStage {
  return { code, label: STAGE_LABEL_BY_CODE[code] };
}

/** 단계별 행동 가이드 표시 순서(공인 5단계 ok→crit). */
const STAGE_GUIDE_ORDER: readonly DroughtStageCode[] = [
  "ok",
  "watch",
  "care",
  "alert",
  "crit",
];

/**
 * 5개 공인 단계별 행동 가이드를 조립한다. 행동 카피는 서버 카탈로그(STAGE_ACTIONS)가
 * 유일 출처이며, 우리 지역 현재 단계 하나만 current=true다(카피를 새로 만들지 않는다).
 */
function buildStageGuide(
  currentCode: DroughtStageCode,
): NonNullable<ForecastResponse["stageGuide"]> {
  return STAGE_GUIDE_ORDER.map((code) => {
    const label = STAGE_LABEL_BY_CODE[code];
    return {
      code,
      label,
      actions: STAGE_ACTIONS[label].map((action) => action.approvedTitle),
      current: code === currentCode,
    };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDaysIso(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD`에 months를 더한 `YYYY-MM`. 일(day)은 버린다(월 단위 전망이라). */
function addMonthsYm(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month))
    return date.slice(0, 7);
  const zeroBased = year * 12 + (month - 1) + months;
  const outYear = Math.floor(zeroBased / 12);
  const outMonth = (zeroBased % 12) + 1;
  return `${String(outYear)}-${String(outMonth).padStart(2, "0")}`;
}

/** 발행 월부터 기준 시각(KST 달력월)까지 지난 개월 수. 음수는 0으로 본다. */
function monthsBetween(publishedOn: string, now: Date): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const from =
    Number(publishedOn.slice(0, 4)) * 12 + Number(publishedOn.slice(5, 7));
  const to = kst.getUTCFullYear() * 12 + (kst.getUTCMonth() + 1);
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, to - from);
}

async function seriesFromSupabase(
  client: ForecastSupabaseClient | null,
  sigunCode: string,
): Promise<SeriesPoint[] | null> {
  if (client === null) return null;
  try {
    const { data, error } = await client
      .from("regional_drought_daily")
      .select("observed_on,avg_ratio,official_stage")
      .eq("sigun_code", sigunCode)
      .order("observed_on", { ascending: false })
      .limit(SERIES_LOOKBACK_DAYS);
    if (error !== null || data === null || data.length === 0) return null;
    const points: SeriesPoint[] = [];
    for (const row of data) {
      const parsed = seriesRowSchema.safeParse(row);
      if (!parsed.success) return null;
      points.push({
        observedOn: parsed.data.observed_on,
        avgRatio: parsed.data.avg_ratio,
        officialStage: parsed.data.official_stage ?? null,
      });
    }
    // 내림차순 조회를 날짜 오름차순으로 뒤집는다.
    return points.sort((a, b) => (a.observedOn < b.observedOn ? -1 : 1));
  } catch {
    return null;
  }
}

function seriesFromSnapshot(
  snapshot: readonly RegionalSnapshotRow[],
  sigunCode: string,
): SeriesPoint[] {
  return snapshot
    .filter((row) => row.sigunCode === sigunCode)
    .map((row) => ({
      observedOn: row.observedOn,
      avgRatio: row.avgRatio,
      officialStage: row.officialStage,
    }))
    .sort((a, b) => (a.observedOn < b.observedOn ? -1 : 1));
}

/** 0~4 예경보 코드 4개를 전부 단계로 변환한다. 하나라도 범위 밖이면 null. */
function toOfficialOutlook(row: {
  publishedOn: string;
  currentLevel: number;
  outlook1m: number;
  outlook2m: number;
  outlook3m: number;
}): OfficialOutlook | null {
  const stages: DroughtStage[] = [];
  for (const code of [
    row.currentLevel,
    row.outlook1m,
    row.outlook2m,
    row.outlook3m,
  ]) {
    const label = outlookLabelFromCode(code);
    if (label === null) return null;
    stages.push({ code: STAGE_CODE_BY_LABEL[label], label });
  }
  const [current, outlook1m, outlook2m, outlook3m] = stages;
  if (
    current === undefined ||
    outlook1m === undefined ||
    outlook2m === undefined ||
    outlook3m === undefined
  ) {
    return null;
  }
  return {
    publishedOn: row.publishedOn,
    current,
    outlook1m,
    outlook2m,
    outlook3m,
    // 화면이 "1개월 뒤"라고 쓰지 않도록 **대상 월을 서버가 확정한다.**
    // 원천이 연 1회 갱신이라 이 월들은 이미 지난 달일 수 있다.
    targetMonths: [
      addMonthsYm(row.publishedOn, 1),
      addMonthsYm(row.publishedOn, 2),
      addMonthsYm(row.publishedOn, 3),
    ],
  };
}

async function outlookFromSupabase(
  client: ForecastSupabaseClient | null,
  sigunCode: string,
): Promise<OfficialOutlook | null> {
  if (client === null) return null;
  try {
    const { data, error } = await client
      .from("official_outlooks")
      .select("published_on,current_level,outlook_1m,outlook_2m,outlook_3m")
      .eq("sigun_code", sigunCode)
      .order("published_on", { ascending: false })
      .limit(1);
    if (error !== null || data === null || data.length === 0) return null;
    const parsed = outlookRowSchema.safeParse(data[0]);
    if (!parsed.success) return null;
    return toOfficialOutlook({
      publishedOn: parsed.data.published_on,
      currentLevel: parsed.data.current_level,
      outlook1m: parsed.data.outlook_1m,
      outlook2m: parsed.data.outlook_2m,
      outlook3m: parsed.data.outlook_3m,
    });
  } catch {
    return null;
  }
}

function outlookFromSnapshot(
  snapshot: readonly OutlookSnapshotRow[],
  sigunCode: string,
): OfficialOutlook | null {
  let latest: OutlookSnapshotRow | null = null;
  for (const row of snapshot) {
    if (row.sigunCode !== sigunCode) continue;
    if (latest === null || row.publishedOn > latest.publishedOn) {
      latest = row;
    }
  }
  if (latest === null) return null;
  return toOfficialOutlook(latest);
}

/** 원천 라벨이 유효하면 원천 우선, 없으면 공인 임계값으로 계산(status-service와 동일 규칙). */
function toOfficialStageCode(point: SeriesPoint): DroughtStageCode {
  const fromLabel =
    point.officialStage === null
      ? null
      : stageCodeFromLabel(point.officialStage);
  return fromLabel ?? stageCodeFromAvgRatio(point.avgRatio);
}

/**
 * sigunCode 하나로 30일 실측 + 14일 예측·밴드 + 추세·도달일 + 공식 전망 병기를 조립한다.
 * HTTP 매핑은 라우트가 맡는다(ok / not_prepared / unavailable).
 */
export async function buildForecast(
  sigunCode: string,
  deps: ForecastServiceDeps = {},
): Promise<ForecastResult> {
  const resolution = await resolveRegion(
    { admCd: sigunCode, legalCode: sigunCode },
    deps.resolver ?? {},
  );
  if (!resolution.prepared || resolution.sigunName === null) {
    return { kind: "not_prepared" };
  }
  const resolvedCode = resolution.sigunCode ?? sigunCode;
  const report = deps.report ?? BACKTEST_REPORT;
  const modelName = report.selectedModel.name;
  const minSeriesDays = Math.max(
    MODEL_MIN_INPUT_DAYS[modelName],
    OBSERVED_TREND_WINDOW_DAYS,
  );

  let client: ForecastSupabaseClient | null | undefined;
  const getClient = (): ForecastSupabaseClient | null => {
    if (client === undefined) {
      try {
        client = (deps.createClient ?? defaultCreateClient)();
      } catch {
        client = null;
      }
    }
    return client;
  };

  let stale = resolution.stale;
  const sources: string[] = [DROUGHT_MAP_SOURCE];

  // 시계열: Supabase 최근 90일 → 부족·실패 시 커밋 스냅샷.
  let series = await seriesFromSupabase(getClient(), resolvedCode);
  if (series === null || series.length < minSeriesDays) {
    const fromSnapshot = seriesFromSnapshot(
      deps.snapshotRegional ?? REGIONAL_SNAPSHOT,
      resolvedCode,
    );
    if (fromSnapshot.length < minSeriesDays) {
      return { kind: "unavailable" };
    }
    series = fromSnapshot;
    const latest = series.at(-1);
    if (latest !== undefined) {
      sources.push(committedSnapshotSource(latest.observedOn));
    }
    stale = true;
  }

  // 추정 시계열 — status와 **같은 함수**로 받아야 오늘 값과 그래프 기준이 어긋나지 않는다.
  // 공표 시계열보다 최신이고 예측 입력 길이를 채울 때만 통째로 갈아끼운다(부분 이어붙이기 금지:
  // 공표 마지막 날짜와 추정 첫 날짜 사이가 몇 달씩 벌어져 기울기가 망가진다).
  let estimate: RegionEstimate | null = null;
  const estimateSeries = await fetchRegionEstimateSeries(
    resolvedCode,
    resolution.sigunName,
    { waterLevel: deps.waterLevel ?? {} },
  );
  const estimateLatest = estimateSeries.at(-1);
  if (
    estimateLatest !== undefined &&
    estimateSeries.length >= minSeriesDays &&
    estimateLatest.observedOn > (series.at(-1)?.observedOn ?? "")
  ) {
    estimate = estimateLatest;
    series = estimateSeries.map((point) => ({
      observedOn: point.observedOn,
      avgRatio: point.avgRatio,
      // 추정값에는 공표 라벨이 없다 — 같은 임계값으로 다시 판정한다.
      officialStage: null,
    }));
    sources.push(REGION_ESTIMATE_SOURCE);
  }

  const basisPoint = series.at(-1);
  if (basisPoint === undefined) {
    return { kind: "unavailable" };
  }
  const officialStageCode = toOfficialStageCode(basisPoint);
  const values = series.map((point) => point.avgRatio);

  // 예측선·밴드 — 채택 모델 + horizon별 잔차 p25/p75(리포트 실측 분위수).
  // 지역 밴드 배율(bandScale)로 안정 지역은 좁히고 변동 지역은 넓힌다.
  const predictions = predict(modelName, values);
  const quantileByHorizon = new Map(
    report.residualQuantiles.map((q) => [q.horizon, q]),
  );
  const bandScale =
    report.models[modelName].byRegion[resolvedCode]?.bandScale ?? 1;
  const forecast: ForecastResponse["forecast"] = predictions.map((value, i) => {
    const horizon = i + 1;
    const quantile = quantileByHorizon.get(horizon);
    if (quantile === undefined) {
      throw new Error(`리포트에 horizon ${String(horizon)} 잔차 분위수가 없다`);
    }
    return {
      observedOn: addDaysIso(basisPoint.observedOn, horizon),
      avgRatio: round2(value),
      low: round2(value + quantile.p25 * bandScale),
      high: round2(value + quantile.p75 * bandScale),
    };
  });

  // 추세·도달일 — 관측 기울기(예측선과 근거 분리). 표시값과 계산값을 일치시키기
  // 위해 소수 2자리(데이터 정밀도)로 반올림한 d를 그대로 쓴다.
  const trendDelta = round2(observedDailyDelta(values));
  const reachDays = daysToNextStage(
    basisPoint.avgRatio,
    trendDelta,
    officialStageCode,
  );
  const nextStageCode = NEXT_STAGE_CODE[officialStageCode];
  const targetStage =
    reachDays !== null && nextStageCode !== undefined
      ? toStageDto(nextStageCode)
      : null;

  // 공식 전망 병기 — 실패해도 응답을 막지 않는다(그마저 없으면 null).
  let officialOutlook = await outlookFromSupabase(getClient(), resolvedCode);
  officialOutlook ??= outlookFromSnapshot(
    deps.snapshotOutlooks ?? OUTLOOKS_SNAPSHOT,
    resolvedCode,
  );
  if (officialOutlook !== null) {
    sources.push(OFFICIAL_OUTLOOK_SOURCE);
    // 발행 후 얼마나 지났는지도 서버가 확정한다 — 화면은 이 값으로 "지난 전망"을 고지한다.
    officialOutlook = {
      ...officialOutlook,
      monthsSincePublished: monthsBetween(
        officialOutlook.publishedOn,
        (deps.now ?? (() => new Date()))(),
      ),
    };
  }

  const body: ForecastResponse = {
    schemaVersion: "1",
    sigunCode: resolvedCode,
    sigunName: resolution.sigunName,
    basis: {
      observedOn: basisPoint.observedOn,
      avgRatio: basisPoint.avgRatio,
      officialStage: toStageDto(officialStageCode),
      // status.region.basis와 같은 뜻이다 — 두 화면이 같은 기준을 쓴다는 걸 보이게 한다.
      basis: estimate === null ? "official" : "estimate",
      estimate:
        estimate === null
          ? null
          : {
              maePp: estimate.maePp,
              reservoirCount: estimate.reservoirCount,
              capacityRatio: estimate.capacityRatio,
            },
    },
    history: series.slice(-HISTORY_DAYS).map((point) => ({
      observedOn: point.observedOn,
      avgRatio: point.avgRatio,
    })),
    forecast,
    trend: { dailyDelta: trendDelta, bucket: toTrendBucket(trendDelta) },
    reach: { days: reachDays, bucket: toReachBucket(reachDays), targetStage },
    model: {
      name: modelName,
      version: report.modelParams.modelVersion,
      mae7: report.selectedModel.mae7,
      mae14: report.selectedModel.mae14,
      mae30: report.selectedModel.mae30,
      bandMethod: "residual_quantile_p25_p75_regional",
    },
    officialOutlook,
    stageGuide: buildStageGuide(officialStageCode),
    asOf: (deps.now ?? (() => new Date()))().toISOString(),
    sources,
    stale,
  };
  return { kind: "ok", body };
}

function defaultCreateClient(): ForecastSupabaseClient {
  // supabase-js 제네릭 빌더를 구조 비교하면 TS2589가 나므로 unknown 경유로 좁힌다
  // (status-service.ts와 동일한 사유 — 형태는 테스트 mock과 계약이 강제).
  return createServiceRoleClient() as unknown as ForecastSupabaseClient;
}
