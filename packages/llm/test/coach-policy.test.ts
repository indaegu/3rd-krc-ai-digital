import { describe, expect, it } from "vitest";

import { HIGH_WATER_ACTION, STAGE_ACTIONS } from "../src/action-catalog.js";
import { selectActions } from "../src/coach-policy.js";
import { StaticCoachProvider } from "../src/static-coach-provider.js";
import type { CoachFactPacket, OfficialStage } from "../src/types.js";

const STAGES: OfficialStage[] = ["정상", "관심", "주의", "경계", "심각"];
const COMBINATIONS = STAGES.flatMap((stage) =>
  [false, true].map((highWaterNotice) => ({ stage, highWaterNotice })),
);

function factsFor(
  stage: OfficialStage,
  highWaterNotice: boolean,
): CoachFactPacket {
  return {
    factSchemaVersion: "1",
    officialStage: stage,
    season: "여름",
    reachBucket: "none",
    trendBucket: "stable",
    highWaterNotice,
    officialOutlookCode: null,
    actions: selectActions(stage, highWaterNotice),
  };
}

describe("selectActions", () => {
  it.each(COMBINATIONS)(
    "returns exactly 3 deterministic actions for %o",
    ({ stage, highWaterNotice }) => {
      const first = selectActions(stage, highWaterNotice);
      const second = selectActions(stage, highWaterNotice);

      expect(first).toHaveLength(3);
      expect(second).toEqual(first);
    },
  );

  it.each(STAGES)(
    "uses the stage's 3 actions in order without high water (%s)",
    (stage) => {
      expect(selectActions(stage, false)).toEqual([...STAGE_ACTIONS[stage]]);
    },
  );

  it.each(STAGES)(
    "puts hw_check_drain first with the stage's top 2 when high water (%s)",
    (stage) => {
      const selected = selectActions(stage, true);

      expect(selected.map(({ id }) => id)).toEqual([
        HIGH_WATER_ACTION.id,
        STAGE_ACTIONS[stage][0].id,
        STAGE_ACTIONS[stage][1].id,
      ]);
    },
  );
});

describe("selectActions + StaticCoachProvider integration", () => {
  it.each(COMBINATIONS)(
    "passes the validator preserving action ids and order for %o",
    async ({ stage, highWaterNotice }) => {
      const facts = factsFor(stage, highWaterNotice);
      const copy = await new StaticCoachProvider().generate(facts);

      expect(copy.actions.map(({ id }) => id)).toEqual(
        facts.actions.map(({ id }) => id),
      );
    },
  );
});
