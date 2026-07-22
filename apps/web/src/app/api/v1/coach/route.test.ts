// GET /api/v1/coach 라우트 테스트 — 정적 코치 전용 공개 경로(LLM 미호출).
// 계약: 400/404/503 + 5개 공인 단계 전부 행동 3개 HTTP 200, mode "static" 고정.
// "@anthropic-ai/sdk"는 vitest alias 스텁으로 치환되어 호출 0회를 카운터로 강제한다.
import type { ApiError, CoachResponse } from "@mulsigye/contracts";
import { STAGE_ACTIONS, type OfficialStage } from "@mulsigye/llm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RegionResolverDeps } from "../../../../lib/data/region-resolver.ts";
import type { StatusSupabaseClient } from "../../../../lib/data/status-service.ts";
import type { WaterLevelFetch } from "../../../../lib/data/waterlevel-api.ts";
import type { ForecastSupabaseClient } from "../../../../lib/prediction/forecast-service.ts";
import type { CoachServiceDeps } from "../../../../lib/coach/coach-service.ts";
import { createCoachHandler } from "./route.ts";
import { anthropicSdkCalls } from "../../../../../test/anthropic-sdk-stub.ts";

const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");
const END_DATE = "2026-07-20";
const TAPJEONG = "4423010045";

const FORBIDDEN_COPY_PATTERN = /위험합니다|발생합니다|됩니다|내려가요/;

beforeAll(() => {
  vi.stubEnv("LLM_ENABLED", "false");
  delete process.env["ANTHROPIC_API_KEY"];
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const SAMPLE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><body>' +
  `<item><check_date>20260719</check_date><county>충청남도 논산시 </county><fac_code>${TAPJEONG}</fac_code>` +
  "<fac_name>탑정</fac_name><rate>58.4</rate><water_level>27.32</water_level></item>" +
  `<item><check_date>20260720</check_date><county>충청남도 논산시 </county><fac_code>${TAPJEONG}</fac_code>` +
  "<fac_name>탑정</fac_name><rate>60.4</rate><water_level>27.48</water_level></item>" +
  "<numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>2</totalCount></body>" +
  "<header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg><returnReasonCode>00</returnReasonCode></header></response>";

const okFetch: WaterLevelFetch = async () =>
  new Response(SAMPLE_XML, {
    status: 200,
    headers: { "content-type": "application/xml" },
  });

const downFetch: WaterLevelFetch = async () =>
  new Response("server error", { status: 500 });

function isoDaysBefore(days: number): string {
  const ms = Date.parse(`${END_DATE}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

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

function makeDeps(avgRatio: number): CoachServiceDeps {
  return {
    status: {
      waterLevel: {
        fetchImpl: okFetch,
        apiKey: "test-key",
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

function coachRequest(query: string): Request {
  return new Request(`http://localhost/api/v1/coach${query}`);
}

/** 완료 게이트: 5개 공인 단계 전부 행동 3개 HTTP 200. */
const STAGE_CASES: readonly { avgRatio: number; stage: OfficialStage }[] = [
  { avgRatio: 80, stage: "정상" },
  { avgRatio: 68, stage: "관심" },
  { avgRatio: 55, stage: "주의" },
  { avgRatio: 46, stage: "경계" },
  { avgRatio: 35, stage: "심각" },
];

describe("GET /api/v1/coach", () => {
  for (const { avgRatio, stage } of STAGE_CASES) {
    it(`${stage} 단계에서 행동 3개(카탈로그 title)와 HTTP 200을 돌려준다`, async () => {
      const handler = createCoachHandler(makeDeps(avgRatio));
      const response = await handler(coachRequest("?sigunCode=44230"));

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");

      const body = (await response.json()) as CoachResponse;
      expect(body.schemaVersion).toBe("1");
      expect(body.mode).toBe("static");
      expect(body.fallbackReason).toBe("disabled");
      expect(body.coach.actions).toHaveLength(3);
      expect(body.coach.actions).toEqual(
        STAGE_ACTIONS[stage].map((action) => ({
          id: action.id,
          title: action.approvedTitle,
          reason: action.approvedRationale,
        })),
      );
      expect(JSON.stringify(body)).not.toMatch(FORBIDDEN_COPY_PATTERN);
    });
  }

  it("sigunCode 형식이 잘못되면 retryable=false 400", async () => {
    const handler = createCoachHandler(makeDeps(68));
    for (const query of [
      "",
      "?sigunCode=1234",
      "?sigunCode=442300",
      "?sigunCode=abcde",
    ]) {
      const response = await handler(coachRequest(query));
      expect(response.status).toBe(400);
      const body = (await response.json()) as ApiError;
      expect(body.retryable).toBe(false);
      expect(body.message.length).toBeGreaterThan(0);
    }
  });

  it("등록 안 된 시군(27140)은 retryable=false 404", async () => {
    const handler = createCoachHandler(makeDeps(68));
    const response = await handler(coachRequest("?sigunCode=27140"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(false);
  });

  it("status·forecast 모두 실패하면 retryable=true 503", async () => {
    const handler = createCoachHandler({
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
    const response = await handler(coachRequest("?sigunCode=44230"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(true);
  });

  it("전 시나리오를 거쳐도 Anthropic 생성·호출은 0회다", () => {
    expect(anthropicSdkCalls.constructed).toBe(0);
    expect(anthropicSdkCalls.messagesCreated).toBe(0);
  });
});
