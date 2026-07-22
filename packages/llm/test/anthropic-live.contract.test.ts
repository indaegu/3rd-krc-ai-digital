import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

import {
  AnthropicCoachProvider,
  type CoachMessagesClient,
} from "../src/anthropic-coach-provider.js";
import { selectActions } from "../src/coach-policy.js";
import type { CoachFactPacket } from "../src/types.js";

/**
 * 보호된 실계약 테스트 — 기본 CI에서는 skip.
 * 실행: `$env:LLM_CONTRACT_TEST='1'` + 실 `ANTHROPIC_API_KEY` 설정 후
 * `pnpm --filter @mulsigye/llm test test/anthropic-live.contract.test.ts`
 * 실 claude-opus-4-7 1회 호출, 비용 약 USD 0.01.
 */
const shouldRun =
  process.env.LLM_CONTRACT_TEST === "1" && !!process.env.ANTHROPIC_API_KEY;

const facts: CoachFactPacket = {
  factSchemaVersion: "1",
  officialStage: "주의",
  season: "여름",
  reachBucket: "within_14d",
  trendBucket: "falling",
  highWaterNotice: false,
  officialOutlookCode: null,
  actions: selectActions("주의", false),
};

describe.runIf(shouldRun)("anthropic live contract (claude-opus-4-7)", () => {
  it("returns structured output that passes the validator with action ids preserved", async () => {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 0,
    });
    let usage: unknown;
    const client: CoachMessagesClient = {
      messages: {
        async create(params, options) {
          const response = await anthropic.messages.create(params, options);
          usage = response.usage;
          return response;
        },
      },
    };

    const copy = await new AnthropicCoachProvider({ client }).generate(facts);

    expect(copy.actions.map(({ id }) => id)).toEqual(
      facts.actions.map(({ id }) => id),
    );
    expect(copy.headline.length).toBeGreaterThan(0);

    // 보고용(키·프롬프트 전문은 출력하지 않는다).
    console.info("[live-contract] headline:", copy.headline);
    console.info("[live-contract] summary:", copy.summary);
    console.info("[live-contract] usage:", JSON.stringify(usage));
  }, 30_000);
});
