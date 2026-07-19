import { z } from "zod";

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
