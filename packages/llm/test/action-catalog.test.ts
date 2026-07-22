import { describe, expect, it } from "vitest";

import {
  ACTION_CATALOG_VERSION,
  ALL_APPROVED_ACTIONS,
  HIGH_WATER_ACTION,
  STAGE_ACTIONS,
} from "../src/action-catalog.js";
import type { OfficialStage } from "../src/types.js";

const STAGES: OfficialStage[] = ["정상", "관심", "주의", "경계", "심각"];
const FORBIDDEN_ASSERTIONS = ["위험합니다", "발생합니다", "됩니다", "내려가요"];

function sentencesOf(text: string): string[] {
  return text
    .split(".")
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

describe("action catalog actions-v1", () => {
  it("is versioned as actions-v1", () => {
    expect(ACTION_CATALOG_VERSION).toBe("actions-v1");
  });

  it("has exactly 3 actions for each of the 5 official stages", () => {
    for (const stage of STAGES) {
      expect(STAGE_ACTIONS[stage]).toHaveLength(3);
    }
  });

  it("has 16 actions in total with no duplicate ids", () => {
    expect(ALL_APPROVED_ACTIONS).toHaveLength(16);
    const ids = ALL_APPROVED_ACTIONS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(16);
  });

  it("keeps approvedTitle within 30 chars and approvedRationale within 70 chars", () => {
    for (const action of ALL_APPROVED_ACTIONS) {
      expect(action.approvedTitle.length).toBeLessThanOrEqual(30);
      expect(action.approvedRationale.length).toBeLessThanOrEqual(70);
    }
  });

  it("contains no forbidden assertion in any copy", () => {
    for (const action of ALL_APPROVED_ACTIONS) {
      const copy = `${action.approvedTitle} ${action.approvedRationale}`;
      for (const forbidden of FORBIDDEN_ASSERTIONS) {
        expect(copy).not.toContain(forbidden);
      }
    }
  });

  it("ends every sentence in 해요체 (…요)", () => {
    for (const action of ALL_APPROVED_ACTIONS) {
      for (const sentence of [
        ...sentencesOf(action.approvedTitle),
        ...sentencesOf(action.approvedRationale),
      ]) {
        expect(sentence.endsWith("요")).toBe(true);
      }
      expect(action.approvedRationale.endsWith("요.")).toBe(true);
    }
  });

  it("delegates to official guidance in the 심각 stage", () => {
    const copy = STAGE_ACTIONS["심각"]
      .map(({ approvedTitle, approvedRationale }) =>
        [approvedTitle, approvedRationale].join(" "),
      )
      .join(" ");
    expect(copy).toContain("공식");
  });

  it("keeps the high-water action as 참고 tone without flood judgement", () => {
    expect(HIGH_WATER_ACTION.id).toBe("hw_check_drain");
    const copy = `${HIGH_WATER_ACTION.approvedTitle} ${HIGH_WATER_ACTION.approvedRationale}`;
    expect(copy).toContain("참고");
    expect(copy).not.toContain("홍수");
  });
});
