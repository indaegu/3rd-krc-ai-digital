import { describe, expect, it } from "vitest";

import { StaticCoachProvider } from "../src/static-coach-provider.js";
import type { CoachFactPacket } from "../src/types.js";

const facts: CoachFactPacket = {
  factSchemaVersion: "1",
  officialStage: "주의",
  season: "여름",
  reachBucket: "within_14d",
  trendBucket: "falling",
  highWaterNotice: false,
  officialOutlookCode: null,
  actions: [
    {
      id: "check-field-water",
      approvedTitle: "논물 상태를 확인해요",
      approvedRationale: "물이 새는 곳이 없는지 먼저 살펴봐요.",
    },
    {
      id: "share-schedule",
      approvedTitle: "급수 일정을 이웃과 맞춰요",
      approvedRationale: "같은 시간에 물이 몰리지 않게 일정을 나눠요.",
    },
  ],
};

describe("StaticCoachProvider", () => {
  it("preserves action ids, count, and order", async () => {
    const result = await new StaticCoachProvider().generate(facts);

    expect(result.actions.map(({ id }) => id)).toEqual([
      "check-field-water",
      "share-schedule",
    ]);
    expect(result.headline.endsWith("해요.")).toBe(true);
    expect(result.summary).toContain("공식 가뭄 예·경보");
  });
});
