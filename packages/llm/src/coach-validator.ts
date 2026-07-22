import { generatedCoachCopySchema } from "./generated-coach-schema.ts";
import type { CoachFactPacket, GeneratedCoachCopy } from "./types.ts";

const FORBIDDEN_ASSERTIONS = ["위험합니다", "발생합니다", "됩니다", "내려가요"];

export function validateGeneratedCoachCopy(
  facts: CoachFactPacket,
  candidate: unknown,
): GeneratedCoachCopy {
  const parsed = generatedCoachCopySchema.parse(candidate);
  const expectedIds = facts.actions.map(({ id }) => id);
  const actualIds = parsed.actions.map(({ id }) => id);

  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    throw new Error("ACTION_IDS_MISMATCH");
  }

  const visibleCopy = [
    parsed.headline,
    parsed.summary,
    ...parsed.actions.map(({ reason }) => reason),
  ].join(" ");

  if (FORBIDDEN_ASSERTIONS.some((word) => visibleCopy.includes(word))) {
    throw new Error("FORBIDDEN_ASSERTION");
  }

  return parsed;
}
