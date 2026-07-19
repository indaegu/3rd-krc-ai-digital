import { describe, expect, it } from "vitest";

import { validateGeneratedCoachCopy } from "../src/coach-validator.js";
import type { CoachFactPacket } from "../src/types.js";

const facts: CoachFactPacket = {
  factSchemaVersion: "1",
  officialStage: "관심",
  season: "여름",
  reachBucket: "within_30d",
  trendBucket: "falling",
  highWaterNotice: false,
  officialOutlookCode: null,
  actions: [
    {
      id: "check-field-water",
      approvedTitle: "논물 상태를 확인해요",
      approvedRationale: "물이 새는 곳이 없는지 먼저 살펴봐요.",
    },
  ],
};

describe("validateGeneratedCoachCopy", () => {
  it("rejects a changed action id", () => {
    expect(() =>
      validateGeneratedCoachCopy(facts, {
        headline: "지금 물 상황을 살펴봐요.",
        summary: "예측은 참고 정보예요.",
        actions: [{ id: "invented-action", reason: "새 행동을 해요." }],
      }),
    ).toThrow("ACTION_IDS_MISMATCH");
  });

  it.each(["위험합니다", "발생합니다", "됩니다"])(
    "rejects forbidden assertion %s",
    (forbidden) => {
      expect(() =>
        validateGeneratedCoachCopy(facts, {
          headline: forbidden,
          summary: "예측은 참고 정보예요.",
          actions: [
            { id: "check-field-water", reason: "논물 상태를 살펴봐요." },
          ],
        }),
      ).toThrow("FORBIDDEN_ASSERTION");
    },
  );
});
