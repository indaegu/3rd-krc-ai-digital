import type { HealthResponse } from "@mulsigye/contracts";

export const dynamic = "force-dynamic";

export function createHealthResponse(now: Date): HealthResponse {
  return {
    schemaVersion: "1",
    service: "mulsigye-api",
    status: "ok",
    asOf: now.toISOString(),
    sources: [],
    stale: false
  };
}

export function GET(): Response {
  return Response.json(createHealthResponse(new Date()), {
    status: 200,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
