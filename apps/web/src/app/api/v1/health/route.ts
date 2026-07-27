import type { HealthResponse } from "@mulsigye/contracts";

import { beginRequest, okJson } from "../../../../lib/api/respond.ts";

export const dynamic = "force-dynamic";

export function createHealthResponse(now: Date): HealthResponse {
  return {
    schemaVersion: "1",
    service: "mulsigye-api",
    status: "ok",
    asOf: now.toISOString(),
    sources: [],
    stale: false,
  };
}

export function GET(): Response {
  const context = beginRequest("/api/v1/health");
  return okJson(context, createHealthResponse(new Date()));
}
