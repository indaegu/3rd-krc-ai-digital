// /api/v1/forecast 오케스트레이션 — 서버 전용.
// 시계열: regional_drought_daily 최근 90일 → 실패 시 커밋 스냅샷(stale=true).
// 예측선·밴드 = 백테스트 채택 모델 + 잔차 p10/p90(data/backtest-report.json),
// 추세·도달일 = 최근 14일 관측 OLS 기울기(observedDailyDelta) — 근거 분리
// (docs/prediction-model.md "d의 정의(2026-07-22 확정)").
// 참고 표현만: 숫자·버킷·단계만 반환하고 문장을 만들지 않는다(AGENTS.md 규칙 3).
import type { DroughtStage, ForecastResponse } from "@mulsigye/contracts";
import { z } from "zod";
import {
  STAGE_LABEL_BY_CODE,
  stageCodeFromAvgRatio,
  stageCodeFromLabel,
  outlookLabelFromCode,
  STAGE_CODE_BY_LABEL,
  type DroughtStageCode,
} from "../data/drought-stage.ts";
import {
  resolveRegion,
  type RegionResolverDeps,
} from "../data/region-resolver.ts";
import type { RegionalSnapshotRow } from "../data/status-service.ts";
import { createServiceRoleClient } from "../data/supabase-server.ts";
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDaysIso(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
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

  const basisPoint = series.at(-1);
  if (basisPoint === undefined) {
    return { kind: "unavailable" };
  }
  const officialStageCode = toOfficialStageCode(basisPoint);
  const values = series.map((point) => point.avgRatio);

  // 예측선·밴드 — 채택 모델 + horizon별 잔차 p10/p90(리포트 실측 분위수).
  const predictions = predict(modelName, values);
  const quantileByHorizon = new Map(
    report.residualQuantiles.map((q) => [q.horizon, q]),
  );
  const forecast: ForecastResponse["forecast"] = predictions.map((value, i) => {
    const horizon = i + 1;
    const quantile = quantileByHorizon.get(horizon);
    if (quantile === undefined) {
      throw new Error(`리포트에 horizon ${String(horizon)} 잔차 분위수가 없다`);
    }
    return {
      observedOn: addDaysIso(basisPoint.observedOn, horizon),
      avgRatio: round2(value),
      low: round2(value + quantile.p10),
      high: round2(value + quantile.p90),
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
  }

  const body: ForecastResponse = {
    schemaVersion: "1",
    sigunCode: resolvedCode,
    sigunName: resolution.sigunName,
    basis: {
      observedOn: basisPoint.observedOn,
      avgRatio: basisPoint.avgRatio,
      officialStage: toStageDto(officialStageCode),
    },
    history: series.slice(-30).map((point) => ({
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
      bandMethod: "residual_quantile_p10_p90",
    },
    officialOutlook,
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
