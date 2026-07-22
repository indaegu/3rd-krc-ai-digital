// 단계 3 완료 게이트 테스트 (docs/work-plan.md 단계 3 "완료" 기준).
// ① 커밋된 data/backtest-report.json이 Zod 스키마를 통과하고 selectedModel·macro
//    mae7/mae14가 존재하며, docs/prediction-model.md 결과 절 문자열에 같은 수치
//    (소수 4자리)가 포함된다 — 문서-리포트 드리프트 가드.
// ② 5개 공인 단계 × 대표 3시군(논산 44230·나주 46170·기장 26710) 15케이스에서
//    coach가 ANTHROPIC_API_KEY 없이 행동 3개를 반환한다(DI mock — stage2-gate 방식).
// ③ forecast 도달일 검증 예제 2개(68/-0.45→18일, 46/-0.67→9일) 재검증.
// 실 네트워크·Supabase·Anthropic 호출 금지 — 전부 DI mock.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CoachResponse } from "@mulsigye/contracts";
import { STAGE_ACTIONS, type OfficialStage } from "@mulsigye/llm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  RegionResolverDeps,
  ReservoirsClient,
} from "../src/lib/data/region-resolver";
import type { StatusSupabaseClient } from "../src/lib/data/status-service";
import type { WaterLevelFetch } from "../src/lib/data/waterlevel-api";
import {
  buildCoach,
  type CoachServiceDeps,
} from "../src/lib/coach/coach-service";
import { backtestReportSchema } from "../src/lib/prediction/backtest-report";
import {
  buildForecast,
  type ForecastSupabaseClient,
} from "../src/lib/prediction/forecast-service";
import backtestReportJson from "../../../data/backtest-report.json" with { type: "json" };

const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");
const END_DATE = "2026-07-20";

// 대표 3개 시군(사용자 확정)과 대표 저수지 — stage2-gate와 동일 근거.
const REGIONS = [
  {
    sigunCode: "44230",
    sigunName: "논산시",
    facCode: "4423010045",
    name: "탑정",
  },
  {
    sigunCode: "46170",
    sigunName: "나주시",
    facCode: "4617010200",
    name: "나주호",
  },
  {
    sigunCode: "26710",
    sigunName: "기장군",
    facCode: "2671010067",
    name: "병산",
  },
] as const;

type Region = (typeof REGIONS)[number];

/** 공인 단계 5종 전부(avgRatio → 70/60/50/40 임계값 기준). */
const STAGE_CASES: readonly { avgRatio: number; stage: OfficialStage }[] = [
  { avgRatio: 80, stage: "정상" },
  { avgRatio: 68, stage: "관심" },
  { avgRatio: 55, stage: "주의" },
  { avgRatio: 46, stage: "경계" },
  { avgRatio: 35, stage: "심각" },
];

beforeAll(() => {
  // 게이트 문구 그대로: LLM 키가 전혀 없어도 행동 3개가 반환된다.
  delete process.env["ANTHROPIC_API_KEY"];
});

afterAll(() => {
  // 다른 파일과 env를 공유하지 않도록 정리(원래도 테스트 환경엔 키가 없다).
  delete process.env["ANTHROPIC_API_KEY"];
});

// ─────────────────────────────────────────────────────────────────────────────
// ① 백테스트 리포트 스키마 + 문서-리포트 드리프트 가드
// ─────────────────────────────────────────────────────────────────────────────

describe("단계 3 게이트 ① — 백테스트 리포트와 문서 동기화", () => {
  const report = backtestReportSchema.parse(backtestReportJson);

  it("커밋된 data/backtest-report.json이 Zod 스키마를 통과한다", () => {
    expect(report.reportVersion).toBe("backtest-v1");
    expect(report.regionCount).toBeGreaterThan(0);
    expect(report.originCount).toBeGreaterThan(0);
  });

  it("selectedModel과 채택 모델의 macro mae7/mae14가 존재하고 서로 일치한다", () => {
    const macro = report.models[report.selectedModel.name].macro;
    expect(Number.isFinite(report.selectedModel.mae7)).toBe(true);
    expect(Number.isFinite(report.selectedModel.mae14)).toBe(true);
    expect(report.selectedModel.mae7).toBe(macro.mae7);
    expect(report.selectedModel.mae14).toBe(macro.mae14);
  });

  it("docs/prediction-model.md 결과 절에 채택 모델명과 같은 수치(소수 4자리)가 있다", () => {
    const doc = readFileSync(
      resolve(process.cwd(), "..", "..", "docs", "prediction-model.md"),
      "utf8",
    );
    expect(doc).toContain(`**${report.selectedModel.name} (채택)**`);
    expect(doc).toContain(report.selectedModel.mae7.toFixed(4));
    expect(doc).toContain(report.selectedModel.mae14.toFixed(4));
    expect(doc).toContain(report.sourceChecksum);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 공용 DI mock (stage2-gate 방식 — 실 네트워크 없음)
// ─────────────────────────────────────────────────────────────────────────────

type SnapshotReservoir = {
  facCode: string;
  name: string;
  sigunCode: string;
  beneficiaryArea: number | null;
};

// 커밋 스냅샷 실데이터로 대표지 결정 규칙이 위 하드코딩 값에 도달함을 함께 검증.
const SNAPSHOT_RESERVOIRS = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "..", "..", "data", "snapshots", "reservoirs.json"),
    "utf8",
  ),
) as SnapshotReservoir[];

function makeReservoirsClient(): ReservoirsClient {
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) =>
          Promise.resolve({
            data: SNAPSHOT_RESERVOIRS.filter(
              (row) => row.sigunCode === value,
            ).map((row) => ({
              fac_code: row.facCode,
              name: row.name,
              beneficiary_area: row.beneficiaryArea,
            })),
            error: null,
          }),
      }),
    }),
  };
}

const workingResolver: RegionResolverDeps = {
  createClient: makeReservoirsClient,
};

/** 수위 API 정상 응답 XML(실측 스키마) — 시설코드만 바꿔 세 시군에 재사용. */
function waterLevelXml(region: Region): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><body>',
    `<item><check_date>20260720</check_date><county>게이트 테스트 </county>`,
    `<fac_code>${region.facCode}</fac_code><fac_name>${region.name}</fac_name>`,
    "<rate>61.2</rate><water_level>12.34</water_level></item>",
    "<numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount>",
    "</body><header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg>",
    "<returnReasonCode>00</returnReasonCode></header></response>",
  ].join("");
}

function okFetch(region: Region): WaterLevelFetch {
  return async () =>
    new Response(waterLevelXml(region), {
      status: 200,
      headers: { "content-type": "application/xml" },
    });
}

function isoDaysBefore(days: number): string {
  const ms = Date.parse(`${END_DATE}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** observed_on 내림차순 90일 시계열(최신 end, slope %p/day) mock 행. */
function regionalRows(end: number, slope: number): Record<string, unknown>[] {
  return Array.from({ length: 90 }, (_, k) => ({
    observed_on: isoDaysBefore(k),
    avg_ratio: round2(end - slope * k),
    official_stage: null,
  }));
}

function makeStatusClient(avgRatio: number): StatusSupabaseClient {
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
                        return Promise.resolve({
                          data: [
                            {
                              observed_on: END_DATE,
                              regional_rate: 55.1,
                              normal_rate: 80,
                              avg_ratio: avgRatio,
                              official_stage: null,
                            },
                          ],
                          error: null,
                        });
                      }
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
          };
        },
        upsert() {
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function makeForecastClient(
  regional: Record<string, unknown>[],
): ForecastSupabaseClient {
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
                      return Promise.resolve({
                        data:
                          table === "regional_drought_daily" ? regional : [],
                        error: null,
                      });
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

function makeCoachDeps(region: Region, avgRatio: number): CoachServiceDeps {
  return {
    status: {
      waterLevel: {
        fetchImpl: okFetch(region),
        apiKey: "gate-test-key",
        now: () => FIXED_NOW,
      },
      createClient: () => makeStatusClient(avgRatio),
      resolver: workingResolver,
    },
    forecast: {
      createClient: () => makeForecastClient(regionalRows(avgRatio, -0.45)),
      resolver: workingResolver,
    },
    now: () => FIXED_NOW,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 5개 공인 단계 × 대표 3시군 = 15케이스 — 키 없이 행동 3개
// ─────────────────────────────────────────────────────────────────────────────

describe.each(REGIONS)(
  "단계 3 게이트 ② — coach $sigunName($sigunCode)",
  (region) => {
    for (const { avgRatio, stage } of STAGE_CASES) {
      it(`${stage} 단계(avgRatio ${String(avgRatio)}) — ANTHROPIC_API_KEY 없이 행동 3개`, async () => {
        expect(process.env["ANTHROPIC_API_KEY"]).toBeUndefined();
        const result = await buildCoach(
          region.sigunCode,
          makeCoachDeps(region, avgRatio),
        );
        expect(result.kind).toBe("ok");
        if (result.kind !== "ok") return;
        const body: CoachResponse = result.body;
        expect(body.mode).toBe("static");
        expect(body.fallbackReason).toBe("disabled");
        expect(body.coach.actions).toHaveLength(3);
        // 행동 ID·순서·title은 카탈로그(단계별 3개 고정)와 정확히 일치한다.
        expect(body.coach.actions).toEqual(
          STAGE_ACTIONS[stage].map((action) => ({
            id: action.id,
            title: action.approvedTitle,
            reason: action.approvedRationale,
          })),
        );
      });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ③ forecast 도달일 검증 예제 2개(docs/prediction-model.md 산식 예제)
// ─────────────────────────────────────────────────────────────────────────────

describe("단계 3 게이트 ③ — 도달일 예제 재검증", () => {
  const NONSAN = REGIONS[0];

  async function reachOf(end: number, slope: number) {
    const result = await buildForecast(NONSAN.sigunCode, {
      createClient: () => makeForecastClient(regionalRows(end, slope)),
      resolver: workingResolver,
      now: () => FIXED_NOW,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("ok를 기대했다");
    return result.body;
  }

  it("avgRatio 68, d=-0.45 → 18일(within_30d, 다음 단계 주의)", async () => {
    const body = await reachOf(68, -0.45);
    expect(body.trend.dailyDelta).toBeCloseTo(-0.45, 8);
    expect(body.reach).toEqual({
      days: 18,
      bucket: "within_30d",
      targetStage: { code: "care", label: "주의" },
    });
  });

  it("avgRatio 46, d=-0.67 → 9일(within_14d, 다음 단계 심각)", async () => {
    const body = await reachOf(46, -0.67);
    expect(body.trend.dailyDelta).toBeCloseTo(-0.67, 8);
    expect(body.reach).toEqual({
      days: 9,
      bucket: "within_14d",
      targetStage: { code: "crit", label: "심각" },
    });
  });
});
