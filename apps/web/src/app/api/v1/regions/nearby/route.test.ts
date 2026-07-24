// GET /api/v1/regions/nearby 라우트 테스트 — 계약(400/404/200)과 no-store를 검증한다.
import type { ApiError, NearbyResponse } from "@mulsigye/contracts";
import { describe, expect, it } from "vitest";
import type { NearbySnapshotRow } from "../../../../../lib/data/nearby-service";
import { createNearbyHandler } from "./route";

const SNAPSHOT: readonly NearbySnapshotRow[] = [
  {
    observedOn: "2025-12-31",
    sidoName: "충남",
    sigunName: "논산시",
    sigunCode: "44230",
    avgRatio: 112.7,
    officialStage: "정상",
  },
  {
    observedOn: "2025-12-31",
    sidoName: "충남",
    sigunName: "당진시",
    sigunCode: "44270",
    avgRatio: 71.9,
    officialStage: "정상",
  },
];

function nearbyRequest(query: string): Request {
  return new Request(`http://localhost/api/v1/regions/nearby${query}`);
}

describe("GET /api/v1/regions/nearby", () => {
  it("정상 sigunCode(44230)면 계약 형태의 NearbyResponse 200을 돌려준다", async () => {
    const handler = createNearbyHandler({ snapshot: SNAPSHOT });
    const response = await handler(nearbyRequest("?sigunCode=44230"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as NearbyResponse;
    expect(body.schemaVersion).toBe("1");
    expect(body.sidoName).toBe("충남");
    expect(body.stale).toBe(true);
    // 가뭄 심한 순: 당진(71.9) → 논산(112.7).
    expect(body.regions.map((r) => r.sigunName)).toEqual(["당진시", "논산시"]);
    expect(body.regions.find((r) => r.current)?.sigunCode).toBe("44230");
  });

  it("sigunCode 형식이 잘못되면 retryable=false 400", async () => {
    const handler = createNearbyHandler({ snapshot: SNAPSHOT });
    for (const query of ["", "?sigunCode=1234", "?sigunCode=abcde"]) {
      const response = await handler(nearbyRequest(query));
      expect(response.status).toBe(400);
      const body = (await response.json()) as ApiError;
      expect(body.retryable).toBe(false);
      expect(body.message.length).toBeGreaterThan(0);
    }
  });

  it("스냅샷에 없는 코드(99999)는 retryable=false 404", async () => {
    const handler = createNearbyHandler({ snapshot: SNAPSHOT });
    const response = await handler(nearbyRequest("?sigunCode=99999"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiError;
    expect(body.code).toBe("REGION_NOT_PREPARED");
    expect(body.retryable).toBe(false);
  });

  it("스냅샷이 비면 retryable=true 503", async () => {
    const handler = createNearbyHandler({ snapshot: [] });
    const response = await handler(nearbyRequest("?sigunCode=44230"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(true);
  });
});
