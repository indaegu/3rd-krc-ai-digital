// GET /api/v1/forecast 라우트 테스트 — 계약(400/404/503)과 스냅샷 폴백 HTTP 200 유지.
// 실 Supabase 호출 금지 — 클라이언트 전부 mock.
import type { ApiError, ForecastResponse } from "@mulsigye/contracts";
import { describe, expect, it } from "vitest";
import type { RegionResolverDeps } from "../../../../lib/data/region-resolver";
import type {
  ForecastServiceDeps,
  ForecastSupabaseClient,
} from "../../../../lib/prediction/forecast-service";
import { createForecastHandler } from "./route";

const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");
const END_DATE = "2026-07-20";

function isoDaysBefore(days: number): string {
  const ms = Date.parse(`${END_DATE}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** observed_on 내림차순 90일 하강(-0.45/day, 최신 68) mock 행. */
const REGIONAL_ROWS = Array.from({ length: 90 }, (_, k) => ({
  observed_on: isoDaysBefore(k),
  avg_ratio: Math.round((68 + 0.45 * k) * 100) / 100,
  official_stage: null,
}));

function makeClient(
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
              { fac_code: "4423010045", name: "탑정", beneficiary_area: 5713 },
            ],
            error: null,
          }),
      }),
    }),
  }),
};

function makeDeps(): ForecastServiceDeps {
  return {
    createClient: () => makeClient(REGIONAL_ROWS),
    resolver: workingResolver,
    now: () => FIXED_NOW,
  };
}

function forecastRequest(query: string): Request {
  return new Request(`http://localhost/api/v1/forecast${query}`);
}

describe("GET /api/v1/forecast", () => {
  it("정상 sigunCode(44230)면 계약 형태의 ForecastResponse 200을 돌려준다", async () => {
    const handler = createForecastHandler(makeDeps());
    const response = await handler(forecastRequest("?sigunCode=44230"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as ForecastResponse;
    expect(body.schemaVersion).toBe("1");
    expect(body.sigunCode).toBe("44230");
    expect(body.sigunName).toBe("논산시");
    expect(body.basis.avgRatio).toBe(68);
    expect(body.history).toHaveLength(30);
    expect(body.forecast).toHaveLength(14);
    expect(body.trend.bucket).toBe("falling");
    expect(body.reach.days).toBe(18);
    expect(body.reach.bucket).toBe("within_30d");
    expect(body.reach.targetStage).toEqual({ code: "care", label: "주의" });
    expect(body.model.name).toBe("naive");
    expect(body.stale).toBe(false);
    expect(new Date(body.asOf).toString()).not.toBe("Invalid Date");
  });

  it("sigunCode 형식이 잘못되면 retryable=false 400", async () => {
    const handler = createForecastHandler(makeDeps());
    for (const query of [
      "",
      "?sigunCode=1234",
      "?sigunCode=442300",
      "?sigunCode=abcde",
    ]) {
      const response = await handler(forecastRequest(query));
      expect(response.status).toBe(400);
      const body = (await response.json()) as ApiError;
      expect(body.retryable).toBe(false);
      expect(body.message.length).toBeGreaterThan(0);
    }
  });

  it("prepared가 아닌 코드(27140)는 retryable=false 404", async () => {
    const handler = createForecastHandler(makeDeps());
    const response = await handler(forecastRequest("?sigunCode=27140"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(false);
  });

  it("Supabase 장애 + 스냅샷에도 시계열이 없으면 retryable=true 503", async () => {
    const handler = createForecastHandler({
      createClient: () => {
        throw new Error("supabase unavailable");
      },
      resolver: workingResolver,
      snapshotRegional: [],
      snapshotOutlooks: [],
      now: () => FIXED_NOW,
    });
    const response = await handler(forecastRequest("?sigunCode=44230"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(true);
  });

  it("Supabase 장애여도 커밋 스냅샷 폴백으로 HTTP 200 stale=true를 유지한다", async () => {
    const handler = createForecastHandler({
      createClient: () => {
        throw new Error("supabase unavailable");
      },
      resolver: workingResolver,
      snapshotRegional: Array.from({ length: 30 }, (_, k) => ({
        observedOn: isoDaysBefore(k),
        sigunCode: "44230",
        regionalRate: null,
        normalRate: null,
        avgRatio: Math.round((68 + 0.45 * k) * 100) / 100,
        officialStage: "관심",
      })),
      snapshotOutlooks: [],
      now: () => FIXED_NOW,
    });
    const response = await handler(forecastRequest("?sigunCode=44230"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as ForecastResponse;
    expect(body.stale).toBe(true);
    expect(
      body.sources.some((source) => source.startsWith("커밋 스냅샷(기준 ")),
    ).toBe(true);
  });
});
