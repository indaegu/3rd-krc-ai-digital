import type { ApiError } from "@mulsigye/contracts";
import { describe, expect, it } from "vitest";

import { createRateLimiter } from "../../../../lib/api/rate-limit.ts";
import { createHealthHandler, createHealthResponse, GET } from "./route";

function healthRequest(ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/v1/health", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/v1/health", () => {
  it("returns the versioned OpenAPI payload", async () => {
    const fixedNow = new Date("2026-07-19T00:00:00.000Z");

    expect(createHealthResponse(fixedNow)).toEqual({
      schemaVersion: "1",
      service: "mulsigye-api",
      status: "ok",
      asOf: fixedNow.toISOString(),
      sources: [],
      stale: false,
    });

    const response = GET(healthRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // 상류를 부르지 않는 가장 싼 경로지만 호출마다 서버리스 실행이 붙는다.
  // 계약이 429를 광고하므로 실제로 그 응답이 나와야 한다.
  it("상한을 넘으면 429로 막는다", async () => {
    const handler = createHealthHandler({
      rateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    });

    expect(handler(healthRequest()).status).toBe(200);
    const blocked = handler(healthRequest());

    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as ApiError;
    expect(body.code).toBe("TOO_MANY_REQUESTS");
    expect(body.retryable).toBe(true);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("다른 클라이언트는 서로 영향을 주지 않는다", () => {
    const handler = createHealthHandler({
      rateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    });

    expect(handler(healthRequest("1.1.1.1")).status).toBe(200);
    expect(handler(healthRequest("2.2.2.2")).status).toBe(200);
    expect(handler(healthRequest("1.1.1.1")).status).toBe(429);
  });
});
