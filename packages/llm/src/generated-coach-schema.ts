import { z } from "zod";

/**
 * Anthropic 구조화 출력(output_config.format)용 JSON Schema.
 * 구조만 강제한다(additionalProperties:false + required). 길이·의미 규칙은
 * 스키마에 넣지 않고 CoachValidator(validateGeneratedCoachCopy)가 검증한다.
 */
export const GENERATED_COACH_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "summary", "actions"],
  additionalProperties: false,
};

export const generatedCoachCopySchema = z
  .object({
    headline: z.string().min(1).max(30),
    summary: z.string().min(1).max(100),
    actions: z
      .array(
        z
          .object({
            id: z.string().min(1),
            reason: z.string().min(1).max(70),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();
