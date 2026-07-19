import { describe, expect, it } from "vitest";

import { createHealthResponse, GET } from "./route";

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

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
