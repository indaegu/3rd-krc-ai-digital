import { describe, expect, expectTypeOf, it } from "vitest";

import statusOk from "../examples/status.ok.json" with { type: "json" };
import statusStale from "../examples/status.stale.json" with { type: "json" };
import type { DroughtStageCode, StatusResponse } from "../src/index.js";

describe("status contract fixtures", () => {
  it("keeps the success fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      sigunCode: "44230",
      sigunName: "논산시",
      reservoir: {
        facCode: "4423010045",
        name: "탑정",
        rate: 87.5,
        waterLevel: 32.1,
        observedOn: "2026-07-20",
      },
      region: {
        observedOn: "2026-07-20",
        regionalRate: 82.4,
        normalRate: 88.1,
        avgRatio: 93.5,
        officialStage: {
          code: "ok",
          label: "정상",
        },
      },
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["농촌용수 저수지 수위정보 조회", "논가뭄지도"],
      stale: false,
    } satisfies StatusResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<StatusResponse>();
    expect(statusOk).toEqual(contractFixture);
  });

  it("keeps the stale fixture on Supabase snapshot sources with avgRatio above 100", () => {
    const contractFixture = {
      schemaVersion: "1",
      sigunCode: "46170",
      sigunName: "나주시",
      reservoir: {
        facCode: "4617010001",
        name: "나주",
        rate: null,
        waterLevel: null,
        observedOn: null,
      },
      region: {
        observedOn: "2026-07-14",
        regionalRate: 91.2,
        normalRate: 65.1,
        avgRatio: 140.1,
        officialStage: {
          code: "ok",
          label: "정상",
        },
      },
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["Supabase 스냅샷", "논가뭄지도"],
      stale: true,
    } satisfies StatusResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<StatusResponse>();
    expect(statusStale).toEqual(contractFixture);
    expect(statusStale.stale).toBe(true);
    expect(statusStale.sources).toContain("Supabase 스냅샷");
    expect(statusStale.region.avgRatio).toBeGreaterThan(100);
  });

  it("keeps the official stage code union to the five UI tokens", () => {
    const codes = ["ok", "watch", "care", "alert", "crit"] as const;

    expectTypeOf<(typeof codes)[number]>().toEqualTypeOf<DroughtStageCode>();
  });
});
