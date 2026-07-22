import { describe, expect, it, vi } from "vitest";

import { selectActions } from "../src/coach-policy.js";
import {
  AnthropicCoachProvider,
  type CoachMessageResponse,
  type CoachMessagesClient,
} from "../src/anthropic-coach-provider.js";
import { PROMPT_VERSION, buildCoachPrompt } from "../src/coach-prompt.js";
import { LLM_TIMEOUT_MS } from "../src/constants.js";
import type { CoachFactPacket } from "../src/types.js";

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

const validCopy = {
  headline: "우리 지역 물 상황을 살펴봐요.",
  summary: "예측은 참고 정보예요. 오늘 할 일부터 확인해요.",
  actions: facts.actions.map(({ id }) => ({
    id,
    reason: "지금 챙기면 물을 아낄 수 있어요.",
  })),
};

function textResponse(
  payload: unknown,
  stopReason: string | null = "end_turn",
): CoachMessageResponse {
  return {
    stop_reason: stopReason,
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload),
      },
    ],
  };
}

function makeClient(result: CoachMessageResponse | Error) {
  const create = vi.fn<CoachMessagesClient["messages"]["create"]>(async () => {
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  const client: CoachMessagesClient = { messages: { create } };
  return { client, create };
}

describe("buildCoachPrompt (coach-v1)", () => {
  it("has the fixed prompt version", () => {
    expect(PROMPT_VERSION).toBe("coach-v1");
  });

  it("states the responsibility boundary in the system prompt", () => {
    const { system } = buildCoachPrompt(facts);

    expect(system).toContain("우리 지역");
    expect(system).toContain("위험합니다");
    expect(system).toContain("발생합니다");
    expect(system).toContain("됩니다");
    expect(system).toContain("내려가요");
    expect(system).toContain("참고");
    expect(system).toContain("JSON");
  });

  it("keeps the server-provided action ids in order in the user message", () => {
    const { user } = buildCoachPrompt(facts);
    const positions = facts.actions.map(({ id }) => user.indexOf(id));

    expect(positions.every((index) => index >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("AnthropicCoachProvider", () => {
  it("returns validated copy for a structured output response", async () => {
    const { client } = makeClient(textResponse(validCopy));
    const provider = new AnthropicCoachProvider({ client });

    const copy = await provider.generate(facts);

    expect(copy.headline).toBe(validCopy.headline);
    expect(copy.actions.map(({ id }) => id)).toEqual(
      facts.actions.map(({ id }) => id),
    );
  });

  it("sends the fixed call contract and nothing else", async () => {
    const { client, create } = makeClient(textResponse(validCopy));
    await new AnthropicCoachProvider({ client }).generate(facts);

    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0]!;

    expect(params.model).toBe("claude-opus-4-7");
    expect(params.max_tokens).toBe(256);
    expect(params.output_config).toEqual({
      effort: "low",
      format: {
        type: "json_schema",
        schema: expect.objectContaining({
          type: "object",
          additionalProperties: false,
          required: ["headline", "summary", "actions"],
        }),
      },
    });
    // Opus 4.7은 비기본 샘플링 파라미터를 400으로 거절 — 절대 미전달.
    expect("temperature" in params).toBe(false);
    expect("top_p" in params).toBe(false);
    expect("top_k" in params).toBe(false);
    expect("thinking" in params).toBe(false);
    expect(options).toEqual({ timeout: LLM_TIMEOUT_MS, maxRetries: 0 });
  });

  it("keeps sigunCode, addresses, and raw numbers out of the prompt payload", async () => {
    const { client, create } = makeClient(textResponse(validCopy));
    await new AnthropicCoachProvider({ client }).generate(facts);

    const [params] = create.mock.calls[0]!;
    const promptText = [params.system, JSON.stringify(params.messages)].join(
      "\n",
    );

    expect(promptText).not.toMatch(/sigunCode/i);
    expect(promptText).not.toContain("주소");
    expect(promptText).not.toMatch(/\d/);
  });

  it("propagates a timeout failure", async () => {
    const { client } = makeClient(
      Object.assign(new Error("Request timed out."), {
        name: "APIConnectionTimeoutError",
      }),
    );

    await expect(
      new AnthropicCoachProvider({ client }).generate(facts),
    ).rejects.toThrow("Request timed out.");
  });

  it.each([
    [429, "rate_limit_error"],
    [500, "api_error"],
    [529, "overloaded_error"],
  ])("propagates provider HTTP %i errors", async (status, type) => {
    const { client } = makeClient(Object.assign(new Error(type), { status }));

    await expect(
      new AnthropicCoachProvider({ client }).generate(facts),
    ).rejects.toThrow(type);
  });

  it("throws on stop_reason refusal", async () => {
    const { client } = makeClient(textResponse(validCopy, "refusal"));

    await expect(
      new AnthropicCoachProvider({ client }).generate(facts),
    ).rejects.toThrow("PROVIDER_REFUSAL");
  });

  it("throws on stop_reason max_tokens", async () => {
    const { client } = makeClient(textResponse(validCopy, "max_tokens"));

    await expect(
      new AnthropicCoachProvider({ client }).generate(facts),
    ).rejects.toThrow("PROVIDER_MAX_TOKENS");
  });

  it("throws ACTION_IDS_MISMATCH when the model reorders action ids", async () => {
    const reordered = {
      ...validCopy,
      actions: [...validCopy.actions].reverse(),
    };
    const { client } = makeClient(textResponse(reordered));

    await expect(
      new AnthropicCoachProvider({ client }).generate(facts),
    ).rejects.toThrow("ACTION_IDS_MISMATCH");
  });

  it("throws FORBIDDEN_ASSERTION when the model uses a forbidden phrase", async () => {
    const forbidden = {
      ...validCopy,
      summary: "곧 심각 단계가 발생합니다.",
    };
    const { client } = makeClient(textResponse(forbidden));

    await expect(
      new AnthropicCoachProvider({ client }).generate(facts),
    ).rejects.toThrow("FORBIDDEN_ASSERTION");
  });

  it("throws when the response has no text block", async () => {
    const { client } = makeClient({ stop_reason: "end_turn", content: [] });

    await expect(
      new AnthropicCoachProvider({ client }).generate(facts),
    ).rejects.toThrow("PROVIDER_EMPTY_RESPONSE");
  });

  it("throws when the response text is not JSON", async () => {
    const { client } = makeClient(textResponse("이건 JSON이 아니에요."));

    await expect(
      new AnthropicCoachProvider({ client }).generate(facts),
    ).rejects.toThrow();
  });
});
