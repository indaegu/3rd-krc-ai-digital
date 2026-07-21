// GET /api/v1/status 라우트 테스트 — 계약(400/404/503)과 폴백 3단 HTTP 200 유지 검증.
// 실 KRC 키 호출 금지 — fetch·Supabase 전부 mock.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiError, StatusResponse } from "@mulsigye/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RegionResolverDeps,
  ReservoirsClient,
} from "../../../../lib/data/region-resolver";
import type {
  StatusServiceDeps,
  StatusSupabaseClient,
} from "../../../../lib/data/status-service";
import type { WaterLevelFetch } from "../../../../lib/data/waterlevel-api";
import { createStatusHandler } from "./route";

const sampleXml = readFileSync(
  join(process.cwd(), "test", "fixtures", "krc-waterlevel-sample.xml"),
  "utf8",
);

const RAW_KEY = "route+test/key==";
const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");

const okFetch: WaterLevelFetch = async () =>
  new Response(sampleXml, {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
const downFetch: WaterLevelFetch = async () => {
  throw new DOMException("The operation timed out.", "TimeoutError");
};

const REGIONAL_ROW = {
  observed_on: "2026-07-20",
  regional_rate: 55.1,
  normal_rate: 80,
  avg_ratio: 112.7,
  official_stage: "정상",
};

function makeStatusClient(
  regionalData: Record<string, unknown>[],
): StatusSupabaseClient {
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
                          table === "regional_drought_daily"
                            ? regionalData
                            : [],
                        error: null,
                      });
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

const workingResolver: RegionResolverDeps = {
  createClient: (): ReservoirsClient => ({
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

function makeDeps(fetchImpl: WaterLevelFetch): StatusServiceDeps {
  return {
    waterLevel: { fetchImpl, apiKey: RAW_KEY, now: () => FIXED_NOW },
    createClient: () => makeStatusClient([REGIONAL_ROW]),
    resolver: workingResolver,
    now: () => FIXED_NOW,
  };
}

function statusRequest(query: string): Request {
  return new Request(`http://localhost/api/v1/status${query}`);
}

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  consoleSpies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/v1/status", () => {
  it("정상 sigunCode(44230)면 계약 형태의 StatusResponse 200을 돌려준다", async () => {
    const handler = createStatusHandler(makeDeps(okFetch));
    const response = await handler(statusRequest("?sigunCode=44230"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as StatusResponse;
    expect(body.schemaVersion).toBe("1");
    expect(body.sigunCode).toBe("44230");
    expect(body.sigunName).toBe("논산시");
    expect(body.reservoir).toEqual({
      facCode: "4423010045",
      name: "탑정",
      rate: 60.4,
      waterLevel: 27.48,
      observedOn: "2026-07-20",
    });
    expect(body.region.avgRatio).toBe(112.7);
    expect(body.region.officialStage).toEqual({ code: "ok", label: "정상" });
    expect(body.stale).toBe(false);
    expect(new Date(body.asOf).toString()).not.toBe("Invalid Date");

    // rate(원저수율)와 avgRatio(평년 대비)는 응답에서 서로 다른 필드다.
    expect(body.reservoir.rate).toBe(60.4);
    expect(body.region.avgRatio).toBe(112.7);

    // API 키가 어떤 로그에도 노출되지 않는다.
    const logText = JSON.stringify(
      consoleSpies.flatMap((spy) => spy.mock.calls),
    );
    expect(logText).not.toContain(RAW_KEY);
    expect(logText).not.toContain(encodeURIComponent(RAW_KEY));
  });

  it("sigunCode 형식이 잘못되면 retryable=false 400", async () => {
    const handler = createStatusHandler(makeDeps(okFetch));
    for (const query of [
      "",
      "?sigunCode=1234",
      "?sigunCode=442300",
      "?sigunCode=abcde",
    ]) {
      const response = await handler(statusRequest(query));
      expect(response.status).toBe(400);
      const body = (await response.json()) as ApiError;
      expect(body.retryable).toBe(false);
      expect(body.message.length).toBeGreaterThan(0);
    }
  });

  it("prepared가 아닌 코드(27140)는 retryable=false 404", async () => {
    const handler = createStatusHandler(makeDeps(okFetch));
    const response = await handler(statusRequest("?sigunCode=27140"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(false);
  });

  it("API·Supabase·스냅샷이 전부 실패하면 retryable=true 503", async () => {
    const handler = createStatusHandler({
      waterLevel: {
        fetchImpl: downFetch,
        apiKey: RAW_KEY,
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
      now: () => FIXED_NOW,
    });
    const response = await handler(statusRequest("?sigunCode=44230"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(true);
  });

  it("수위 API 장애여도 커밋 스냅샷 폴백으로 HTTP 200 stale=true를 유지한다", async () => {
    const handler = createStatusHandler({
      waterLevel: {
        fetchImpl: downFetch,
        apiKey: RAW_KEY,
        now: () => FIXED_NOW,
      },
      createClient: () => {
        throw new Error("supabase unavailable");
      },
      resolver: workingResolver,
      now: () => FIXED_NOW,
    });
    const response = await handler(statusRequest("?sigunCode=44230"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as StatusResponse;
    expect(body.stale).toBe(true);
    expect(
      body.sources.some((source) => source.startsWith("커밋 스냅샷(기준 ")),
    ).toBe(true);
  });
});
