// coach-service 테스트 — 정적 코치 전용 조립(LLM 미호출).
// 실 Supabase·KRC·Anthropic 호출 금지 — 전부 mock/스텁.
// "@anthropic-ai/sdk"는 vitest alias 스텁(test/anthropic-sdk-stub.ts)으로 치환되어
// 생성·호출 횟수가 카운터에 기록된다 — 이 파일은 0회를 강제한다.
import type { CoachResponse } from "@mulsigye/contracts";
import {
  ACTION_CATALOG_VERSION,
  HIGH_WATER_ACTION,
  PROMPT_VERSION,
  STAGE_ACTIONS,
  type OfficialStage,
} from "@mulsigye/llm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RegionResolverDeps } from "../data/region-resolver.ts";
import type { StatusSupabaseClient } from "../data/status-service.ts";
import type { WaterLevelFetch } from "../data/waterlevel-api.ts";
import type { ForecastSupabaseClient } from "../prediction/forecast-service.ts";
import { buildCoach, type CoachServiceDeps } from "./coach-service.ts";
import { anthropicSdkCalls } from "../../../test/anthropic-sdk-stub.ts";

const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");
const END_DATE = "2026-07-20";
const NONSAN = "44230";
const TAPJEONG = "4423010045";

/** 금지 단정 표현(플랜 Global Constraints — CoachValidator와 동일 목록). */
const FORBIDDEN_COPY_PATTERN = /위험합니다|발생합니다|됩니다|내려가요/;

beforeAll(() => {
  // 완료 게이트 문구 그대로: ANTHROPIC_API_KEY가 전혀 없고 LLM_ENABLED=false여도
  // 5개 공인 단계 전부에서 행동 3개가 HTTP 200으로 반환된다.
  vi.stubEnv("LLM_ENABLED", "false");
  delete process.env["ANTHROPIC_API_KEY"];
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function waterLevelXml(
  rows: readonly { date: string; rate: number }[],
): string {
  const items = rows
    .map(
      (row) =>
        `<item><check_date>${row.date}</check_date><county>충청남도 논산시 </county>` +
        `<fac_code>${TAPJEONG}</fac_code><fac_name>탑정</fac_name>` +
        `<rate>${String(row.rate)}</rate><water_level>27.4</water_level></item>`,
    )
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><body>' +
    `${items}<numOfRows>10</numOfRows><pageNo>1</pageNo>` +
    `<totalCount>${String(rows.length)}</totalCount></body>` +
    "<header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg>" +
    "<returnReasonCode>00</returnReasonCode></header></response>"
  );
}

const NORMAL_XML = waterLevelXml([
  { date: "20260719", rate: 58.4 },
  { date: "20260720", rate: 60.4 },
]);

/** 만수위 mock: 최신 원저수율 96, 상승 추세(플랜 Task 7 Step 1). */
const HIGH_WATER_XML = waterLevelXml([
  { date: "20260719", rate: 95.2 },
  { date: "20260720", rate: 96 },
]);

function okFetch(xml: string): WaterLevelFetch {
  return async () =>
    new Response(xml, {
      status: 200,
      headers: { "content-type": "application/xml" },
    });
}

const downFetch: WaterLevelFetch = async () =>
  new Response("server error", { status: 500 });

function isoDaysBefore(days: number): string {
  const ms = Date.parse(`${END_DATE}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** observed_on 내림차순 90일 시계열(최신 end, slope %p/day 하강) mock 행. */
function regionalRows(end: number, slope: number): Record<string, unknown>[] {
  return Array.from({ length: 90 }, (_, k) => ({
    observed_on: isoDaysBefore(k),
    avg_ratio: Math.round((end - slope * k) * 100) / 100,
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

const workingResolver: RegionResolverDeps = {
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              { fac_code: TAPJEONG, name: "탑정", beneficiary_area: 5713 },
            ],
            error: null,
          }),
      }),
    }),
  }),
};

function makeCoachDeps(options: {
  avgRatio: number;
  slope?: number;
  waterXml?: string;
  waterDown?: boolean;
}): CoachServiceDeps {
  const fetchImpl =
    options.waterDown === true
      ? downFetch
      : okFetch(options.waterXml ?? NORMAL_XML);
  return {
    status: {
      waterLevel: { fetchImpl, apiKey: "test-key", now: () => FIXED_NOW },
      createClient: () => makeStatusClient(options.avgRatio),
      resolver: workingResolver,
    },
    forecast: {
      createClient: () =>
        makeForecastClient(
          regionalRows(options.avgRatio, options.slope ?? -0.45),
        ),
      resolver: workingResolver,
    },
    now: () => FIXED_NOW,
  };
}

async function okBody(deps: CoachServiceDeps): Promise<CoachResponse> {
  const result = await buildCoach(NONSAN, deps);
  if (result.kind !== "ok") {
    throw new Error(`ok를 기대했는데 ${result.kind}`);
  }
  return result.body;
}

/** 공인 단계 5종 전부(avgRatio → 70/60/50/40 임계값 기준). */
const STAGE_CASES: readonly { avgRatio: number; stage: OfficialStage }[] = [
  { avgRatio: 80, stage: "정상" },
  { avgRatio: 68, stage: "관심" },
  { avgRatio: 55, stage: "주의" },
  { avgRatio: 46, stage: "경계" },
  { avgRatio: 35, stage: "심각" },
];

describe("buildCoach — 5개 공인 단계 전부 정적 행동 3개", () => {
  for (const { avgRatio, stage } of STAGE_CASES) {
    it(`avgRatio ${String(avgRatio)} → ${stage} 단계 행동 3개(카탈로그 title 결합)`, async () => {
      const body = await okBody(makeCoachDeps({ avgRatio }));
      const expected = STAGE_ACTIONS[stage];

      expect(body.schemaVersion).toBe("1");
      expect(body.coach.actions).toHaveLength(3);
      expect(body.coach.actions).toEqual(
        expected.map((action) => ({
          id: action.id,
          title: action.approvedTitle,
          reason: action.approvedRationale,
        })),
      );
      expect(body.coach.headline.length).toBeGreaterThan(0);
      expect(body.coach.summary.length).toBeGreaterThan(0);
    });
  }
});

describe("buildCoach — 정적 전용 계약", () => {
  it("mode 'static'·fallbackReason 'disabled'·cacheHit false·버전 상수 고정", async () => {
    const body = await okBody(makeCoachDeps({ avgRatio: 68 }));
    expect(body.mode).toBe("static");
    expect(body.fallbackReason).toBe("disabled");
    expect(body.cacheHit).toBe(false);
    expect(body.promptVersion).toBe(PROMPT_VERSION);
    expect(body.actionCatalogVersion).toBe(ACTION_CATALOG_VERSION);
    expect(body.generatedAt).toBe(FIXED_NOW.toISOString());
    expect(body.asOf).toBe(FIXED_NOW.toISOString());
    expect(body.sources).toContain("논가뭄지도");
    expect(body.dataStale).toBe(false);
    expect(body.stale).toBe(false);
  });

  it("ANTHROPIC_API_KEY 미설정 + LLM_ENABLED=false에서 동작한다", async () => {
    expect(process.env["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(process.env["LLM_ENABLED"]).toBe("false");
    const body = await okBody(makeCoachDeps({ avgRatio: 68 }));
    expect(body.mode).toBe("static");
    expect(body.coach.actions).toHaveLength(3);
  });

  it("응답 카피에 금지 단정 표현이 없다", async () => {
    for (const { avgRatio } of STAGE_CASES) {
      const body = await okBody(makeCoachDeps({ avgRatio }));
      expect(JSON.stringify(body.coach)).not.toMatch(FORBIDDEN_COPY_PATTERN);
    }
  });
});

describe("buildCoach — 만수위 참고", () => {
  it("rate 96 상승이면 hw_check_drain이 1순위, 단계 1·2순위가 뒤따른다", async () => {
    const body = await okBody(
      makeCoachDeps({ avgRatio: 68, waterXml: HIGH_WATER_XML }),
    );
    const watchActions = STAGE_ACTIONS["관심"];
    expect(body.coach.actions).toHaveLength(3);
    expect(body.coach.actions[0]).toEqual({
      id: HIGH_WATER_ACTION.id,
      title: HIGH_WATER_ACTION.approvedTitle,
      reason: HIGH_WATER_ACTION.approvedRationale,
    });
    expect(body.coach.actions[1]?.id).toBe(watchActions[0].id);
    expect(body.coach.actions[2]?.id).toBe(watchActions[1].id);
  });

  it("rate가 95 미만이면 만수위 행동이 들어가지 않는다", async () => {
    const body = await okBody(makeCoachDeps({ avgRatio: 68 }));
    expect(
      body.coach.actions.some((action) => action.id === HIGH_WATER_ACTION.id),
    ).toBe(false);
  });
});

describe("buildCoach — 폴백·오류 경로", () => {
  it("수위 API 장애 + Supabase 관측 폴백이면 dataStale=true를 유지한다", async () => {
    const deps = makeCoachDeps({ avgRatio: 68, waterDown: true });
    // 수위 API가 죽으면 status는 스냅샷 관측으로 폴백한다 — 테스트 스냅샷 주입.
    deps.status = {
      ...deps.status,
      snapshotObservations: {
        latestByFacility: [
          {
            facCode: TAPJEONG,
            observedOn: END_DATE,
            rate: 58.4,
            source: "waterlevel_api",
          },
        ],
        representativeRecent30d: {
          [NONSAN]: {
            facCode: TAPJEONG,
            name: "탑정",
            rows: [
              { observedOn: "2026-07-19", rate: 57.9 },
              { observedOn: END_DATE, rate: 58.4 },
            ],
          },
        },
      },
    };
    const body = await okBody(deps);
    expect(body.dataStale).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.mode).toBe("static");
    expect(body.coach.actions).toHaveLength(3);
  });

  it("등록 안 된 시군(27140)은 not_prepared", async () => {
    const result = await buildCoach("27140", makeCoachDeps({ avgRatio: 68 }));
    expect(result.kind).toBe("not_prepared");
  });

  it("status·forecast 모두 실패하면 unavailable", async () => {
    const result = await buildCoach(NONSAN, {
      status: {
        waterLevel: {
          fetchImpl: downFetch,
          apiKey: "test-key",
          now: () => FIXED_NOW,
        },
        createClient: () => {
          throw new Error("supabase unavailable");
        },
        resolver: workingResolver,
        snapshotObservations: {
          latestByFacility: [],
          representativeRecent30d: {},
        },
        snapshotRegional: [],
      },
      forecast: {
        createClient: () => {
          throw new Error("supabase unavailable");
        },
        resolver: workingResolver,
        snapshotRegional: [],
        snapshotOutlooks: [],
      },
      now: () => FIXED_NOW,
    });
    expect(result.kind).toBe("unavailable");
  });
});

describe("buildCoach — Anthropic 미호출 단언", () => {
  it("@anthropic-ai/sdk 생성·messages.create 호출이 0회다", async () => {
    // 이 파일의 모든 시나리오(정상·만수위·폴백)를 거친 뒤에도 카운터는 0이다.
    await okBody(makeCoachDeps({ avgRatio: 68 }));
    await okBody(makeCoachDeps({ avgRatio: 35, waterXml: HIGH_WATER_XML }));
    expect(anthropicSdkCalls.constructed).toBe(0);
    expect(anthropicSdkCalls.messagesCreated).toBe(0);
  });
});
