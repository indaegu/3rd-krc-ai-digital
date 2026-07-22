// forecast-service 테스트 — 예측·밴드·추세(관측 기울기)·도달일·공식 전망 병기와 폴백.
// 실 Supabase 호출 금지 — 클라이언트 전부 mock. 수치는 리포트(data/backtest-report.json)
// 실측값과 손계산으로 검증한다(임의 수치 금지).
import type { ForecastResponse } from "@mulsigye/contracts";
import { describe, expect, it } from "vitest";
import type { RegionResolverDeps } from "../data/region-resolver";
import { backtestReportSchema } from "./backtest-report.ts";
import {
  DROUGHT_MAP_SOURCE,
  OFFICIAL_OUTLOOK_SOURCE,
  buildForecast,
  type ForecastServiceDeps,
  type ForecastSupabaseClient,
  type OutlookSnapshotRow,
} from "./forecast-service.ts";
import backtestReportJson from "../../../../../data/backtest-report.json" with { type: "json" };

const REPORT = backtestReportSchema.parse(backtestReportJson);
const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");
const END_DATE = "2026-07-20";

/** 금지 단정 표현·한국어 문장 종결 가드(플랜 Step 1 — 숫자·enum·날짜·명사만 허용). */
const FORBIDDEN_SENTENCE_PATTERN =
  /위험합니다|발생합니다|됩니다|내려가요|습니다|입니다|해요|하세요|세요\.|어요|아요/;

function isoDaysBefore(days: number): string {
  const ms = Date.parse(`${END_DATE}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * observed_on 내림차순(최신 먼저) regional_drought_daily mock 행.
 * slope(%p/day)로 과거로 갈수록 값이 커지거나 작아진다.
 */
function regionalRows(
  days: number,
  end: number,
  slope: number,
): Record<string, unknown>[] {
  return Array.from({ length: days }, (_, k) => ({
    observed_on: isoDaysBefore(k),
    avg_ratio: round2(end - slope * k),
    official_stage: null,
  }));
}

const OUTLOOK_ROW = {
  published_on: "2026-07-10",
  current_level: 1,
  outlook_1m: 2,
  outlook_2m: 2,
  outlook_3m: 1,
};

function makeClient(options: {
  regional?: Record<string, unknown>[];
  outlooks?: Record<string, unknown>[];
  regionalError?: boolean;
  outlooksError?: boolean;
}): ForecastSupabaseClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      if (table === "regional_drought_daily") {
                        return Promise.resolve(
                          options.regionalError === true
                            ? { data: null, error: { message: "down" } }
                            : { data: options.regional ?? [], error: null },
                        );
                      }
                      return Promise.resolve(
                        options.outlooksError === true
                          ? { data: null, error: { message: "down" } }
                          : { data: options.outlooks ?? [], error: null },
                      );
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

const workingResolver: RegionResolverDeps = {
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              { fac_code: "4423010045", name: "탑정", beneficiary_area: 5713 },
            ],
            error: null,
          }),
      }),
    }),
  }),
};

function makeDeps(
  client: ForecastSupabaseClient,
  overrides: Partial<ForecastServiceDeps> = {},
): ForecastServiceDeps {
  return {
    createClient: () => client,
    resolver: workingResolver,
    now: () => FIXED_NOW,
    ...overrides,
  };
}

async function okBody(deps: ForecastServiceDeps): Promise<ForecastResponse> {
  const result = await buildForecast("44230", deps);
  if (result.kind !== "ok") {
    throw new Error(`ok를 기대했는데 ${result.kind}`);
  }
  return result.body;
}

describe("buildForecast — 정상 경로 (90일 하강 -0.45/day, 최신 68)", () => {
  const deps = makeDeps(
    makeClient({
      regional: regionalRows(90, 68, -0.45),
      outlooks: [OUTLOOK_ROW],
    }),
  );

  it("basis는 최신 실측이고 공인 단계는 avgRatio 68 → 관심", async () => {
    const body = await okBody(deps);
    expect(body.schemaVersion).toBe("1");
    expect(body.sigunCode).toBe("44230");
    expect(body.sigunName).toBe("논산시");
    expect(body.basis).toEqual({
      observedOn: END_DATE,
      avgRatio: 68,
      officialStage: { code: "watch", label: "관심" },
    });
    expect(body.stale).toBe(false);
    expect(body.asOf).toBe(FIXED_NOW.toISOString());
  });

  it("history는 최근 30일 실측(날짜 오름차순)", async () => {
    const body = await okBody(deps);
    expect(body.history).toHaveLength(30);
    expect(body.history[0]?.observedOn).toBe(isoDaysBefore(29));
    expect(body.history.at(-1)).toEqual({
      observedOn: END_DATE,
      avgRatio: 68,
    });
    const dates = body.history.map((p) => p.observedOn);
    expect(dates).toEqual([...dates].sort());
  });

  it("forecast는 naive 수평 14개 + 리포트 잔차 p10/p90 밴드", async () => {
    const body = await okBody(deps);
    expect(body.forecast).toHaveLength(14);
    expect(body.forecast[0]?.observedOn).toBe("2026-07-21");
    expect(body.forecast.at(-1)?.observedOn).toBe("2026-08-03");
    body.forecast.forEach((point, i) => {
      const quantile = REPORT.residualQuantiles[i];
      expect(point.avgRatio).toBe(68); // naive: 마지막 값 유지
      expect(point.low).toBe(round2(68 + (quantile?.p10 ?? Number.NaN)));
      expect(point.high).toBe(round2(68 + (quantile?.p90 ?? Number.NaN)));
      expect(point.low).toBeLessThan(point.avgRatio);
      expect(point.high).toBeGreaterThan(point.avgRatio);
    });
  });

  it("trend는 관측 기울기 기반 — dailyDelta ≈ -0.45, falling", async () => {
    const body = await okBody(deps);
    expect(body.trend.dailyDelta).toBeCloseTo(-0.45, 8);
    expect(body.trend.bucket).toBe("falling");
  });

  it("reach: 68에서 -0.45/day면 18일, within_30d, targetStage 주의", async () => {
    const body = await okBody(deps);
    expect(body.reach).toEqual({
      days: 18,
      bucket: "within_30d",
      targetStage: { code: "care", label: "주의" },
    });
  });

  it("model 메타는 리포트 값과 일치한다", async () => {
    const body = await okBody(deps);
    expect(body.model).toEqual({
      name: REPORT.selectedModel.name,
      version: REPORT.modelParams.modelVersion,
      mae7: REPORT.selectedModel.mae7,
      mae14: REPORT.selectedModel.mae14,
      bandMethod: "residual_quantile_p10_p90",
    });
  });

  it("officialOutlook은 최신 1건을 0~4 코드 → 단계로 변환해 병기한다", async () => {
    const body = await okBody(deps);
    expect(body.officialOutlook).toEqual({
      publishedOn: "2026-07-10",
      current: { code: "watch", label: "관심" },
      outlook1m: { code: "care", label: "주의" },
      outlook2m: { code: "care", label: "주의" },
      outlook3m: { code: "watch", label: "관심" },
    });
    expect(body.sources).toContain(DROUGHT_MAP_SOURCE);
    expect(body.sources).toContain(OFFICIAL_OUTLOOK_SOURCE);
  });

  it("참고 표현 가드: 직렬화 응답에 한국어 문장·금지 단정 표현이 없다", async () => {
    const body = await okBody(deps);
    expect(JSON.stringify(body)).not.toMatch(FORBIDDEN_SENTENCE_PATTERN);
  });
});

describe("buildForecast — product.md 데모 수치 정합 (46, -0.67/day)", () => {
  it("경계 단계에서 9일, within_14d, targetStage 심각", async () => {
    const body = await okBody(
      makeDeps(makeClient({ regional: regionalRows(90, 46, -0.67) })),
    );
    expect(body.basis.officialStage).toEqual({ code: "alert", label: "경계" });
    expect(body.trend.dailyDelta).toBeCloseTo(-0.67, 8);
    expect(body.reach).toEqual({
      days: 9,
      bucket: "within_14d",
      targetStage: { code: "crit", label: "심각" },
    });
  });
});

describe("buildForecast — 상승 시계열", () => {
  it("reach는 null/none, trend는 rising, targetStage는 null", async () => {
    const body = await okBody(
      makeDeps(makeClient({ regional: regionalRows(90, 93.5, 0.32) })),
    );
    expect(body.trend.dailyDelta).toBeCloseTo(0.32, 8);
    expect(body.trend.bucket).toBe("rising");
    expect(body.reach).toEqual({
      days: null,
      bucket: "none",
      targetStage: null,
    });
  });
});

describe("buildForecast — 폴백·오류 경로", () => {
  // k=0이 최신(68), 과거로 갈수록 +0.45씩 높다(하강 추세 스냅샷 30일).
  const snapshotRegional = Array.from({ length: 30 }, (_, k) => ({
    observedOn: isoDaysBefore(k),
    sigunCode: "44230",
    regionalRate: null,
    normalRate: null,
    avgRatio: round2(68 + 0.45 * k),
    officialStage: "관심",
  }));

  const snapshotOutlooks: OutlookSnapshotRow[] = [
    {
      publishedOn: "2026-07-03",
      sidoName: "충남",
      sigunName: "논산시",
      sigunCode: "44230",
      currentLevel: 1,
      outlook1m: 1,
      outlook2m: 0,
      outlook3m: 0,
    },
    {
      publishedOn: "2026-06-26",
      sidoName: "충남",
      sigunName: "논산시",
      sigunCode: "44230",
      currentLevel: 0,
      outlook1m: 0,
      outlook2m: 0,
      outlook3m: 0,
    },
  ];

  it("Supabase 장애면 스냅샷 폴백으로 stale=true ok", async () => {
    const result = await buildForecast("44230", {
      createClient: () => {
        throw new Error("supabase unavailable");
      },
      resolver: workingResolver,
      snapshotRegional,
      snapshotOutlooks,
      now: () => FIXED_NOW,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.stale).toBe(true);
    expect(
      result.body.sources.some((s) => s.startsWith("커밋 스냅샷(기준 ")),
    ).toBe(true);
    expect(result.body.basis.avgRatio).toBe(68);
    expect(result.body.forecast).toHaveLength(14);
    // 스냅샷 outlook 중 최신(2026-07-03) 1건을 병기한다.
    expect(result.body.officialOutlook?.publishedOn).toBe("2026-07-03");
    expect(result.body.officialOutlook?.outlook1m).toEqual({
      code: "watch",
      label: "관심",
    });
  });

  it("outlook이 Supabase·스냅샷 모두 없으면 null (병기 실패가 200을 막지 않는다)", async () => {
    const body = await okBody(
      makeDeps(
        makeClient({
          regional: regionalRows(90, 68, -0.45),
          outlooksError: true,
        }),
        { snapshotOutlooks: [] },
      ),
    );
    expect(body.officialOutlook).toBeNull();
    expect(body.sources).not.toContain(OFFICIAL_OUTLOOK_SOURCE);
  });

  it("준비 안 된 시군(27140)은 not_prepared", async () => {
    const result = await buildForecast("27140", makeDeps(makeClient({})));
    expect(result.kind).toBe("not_prepared");
  });

  it("Supabase 장애 + 스냅샷에도 시계열이 없으면 unavailable", async () => {
    const result = await buildForecast("44230", {
      createClient: () => {
        throw new Error("supabase unavailable");
      },
      resolver: workingResolver,
      snapshotRegional: [],
      snapshotOutlooks: [],
      now: () => FIXED_NOW,
    });
    expect(result.kind).toBe("unavailable");
  });

  it("시계열이 14일 미만이면 unavailable (모델 최소 입력 계약)", async () => {
    const result = await buildForecast("44230", {
      createClient: () => makeClient({ regional: regionalRows(10, 68, -0.45) }),
      resolver: workingResolver,
      snapshotRegional: [],
      snapshotOutlooks: [],
      now: () => FIXED_NOW,
    });
    expect(result.kind).toBe("unavailable");
  });
});
