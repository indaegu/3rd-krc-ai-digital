import { describe, expect, expectTypeOf, it } from "vitest";

import healthError from "../examples/health.error.json" with { type: "json" };
import healthOk from "../examples/health.ok.json" with { type: "json" };
import type { ApiError, HealthResponse } from "../src/index.js";

describe("health contract fixtures", () => {
  it("keeps the success fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      service: "mulsigye-api",
      status: "ok",
      asOf: "2026-07-19T00:00:00.000Z",
      sources: [],
      stale: false
    } satisfies HealthResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<HealthResponse>();
    expect(healthOk).toEqual(contractFixture);
  });

  it("keeps the error fixture assignable to the generated OpenAPI type", () => {
    expectTypeOf(healthError).toMatchTypeOf<ApiError>();
    expect(healthError.retryable).toBe(true);
  });
});
