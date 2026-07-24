import { describe, expect, expectTypeOf, it } from "vitest";

import type { NearbyResponse } from "../src/index.js";

describe("nearby contract", () => {
  it("keeps a same-province comparison fixture assignable to the generated type", () => {
    const fixture = {
      schemaVersion: "1",
      sidoName: "충남",
      asOf: "2025-12-31",
      regions: [
        {
          sigunCode: "44270",
          sigunName: "당진시",
          avgRatio: 71.9,
          stageCode: "ok",
          current: false,
        },
        {
          sigunCode: "44230",
          sigunName: "논산시",
          avgRatio: 112.7,
          stageCode: "ok",
          current: true,
        },
      ],
      stale: true,
      sources: ["커밋 스냅샷(기준 2025-12-31)"],
    } satisfies NearbyResponse;

    expectTypeOf(fixture).toMatchTypeOf<NearbyResponse>();
    expect(fixture.stale).toBe(true);
    expect(fixture.regions).toHaveLength(2);
    expect(fixture.regions.some((region) => region.current)).toBe(true);
  });

  it("limits stageCode to the five UI tokens", () => {
    type StageCode = NearbyResponse["regions"][number]["stageCode"];
    const codes = ["ok", "watch", "care", "alert", "crit"] as const;
    expectTypeOf<(typeof codes)[number]>().toEqualTypeOf<StageCode>();
  });

  it("requires the current flag as a boolean on every region", () => {
    type Current = NearbyResponse["regions"][number]["current"];
    expectTypeOf<Current>().toEqualTypeOf<boolean>();
  });
});
