import Anthropic from "@anthropic-ai/sdk";

import { buildCoachPrompt } from "./coach-prompt.js";
import { validateGeneratedCoachCopy } from "./coach-validator.js";
import {
  ANTHROPIC_MODEL,
  LLM_MAX_TOKENS,
  LLM_TIMEOUT_MS,
} from "./constants.js";
import { GENERATED_COACH_JSON_SCHEMA } from "./generated-coach-schema.js";
import type {
  CoachFactPacket,
  CoachProvider,
  GeneratedCoachCopy,
} from "./types.js";

/** 테스트 mock과 실제 Anthropic 클라이언트가 공유하는 최소 표면. */
export type CoachMessageResponse = {
  stop_reason: string | null;
  content: ReadonlyArray<{ type: string; text?: string }>;
};

export type CoachMessagesClient = {
  messages: {
    create(
      params: Anthropic.Messages.MessageCreateParamsNonStreaming,
      options?: { timeout?: number; maxRetries?: number },
    ): Promise<CoachMessageResponse>;
  };
};

export type AnthropicCoachProviderOptions = {
  /** 테스트용 DI. 없으면 apiKey로 실제 클라이언트를 만든다(동기 재시도 0회). */
  client?: CoachMessagesClient;
  apiKey?: string;
};

/**
 * claude-opus-4-7 구조화 출력 호출 어댑터(미연결).
 * - 캐시·lock·예산 가드 없이 공개 Route Handler에 연결하지 않는다(packages/llm AGENTS.md).
 * - temperature/top_p/top_k/thinking은 절대 전달하지 않는다(Opus 4.7은 400으로 거절).
 * - 모든 실패는 throw — 정적 코치 폴백 결정은 호출자 몫이다. 로그를 남기지 않는다.
 */
export class AnthropicCoachProvider implements CoachProvider {
  private readonly client: CoachMessagesClient;

  constructor(options: AnthropicCoachProviderOptions = {}) {
    this.client =
      options.client ??
      new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });
  }

  async generate(facts: CoachFactPacket): Promise<GeneratedCoachCopy> {
    const { system, user } = buildCoachPrompt(facts);

    const response = await this.client.messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: LLM_MAX_TOKENS,
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: GENERATED_COACH_JSON_SCHEMA,
          },
        },
        system,
        messages: [{ role: "user", content: user }],
      },
      { timeout: LLM_TIMEOUT_MS, maxRetries: 0 },
    );

    if (response.stop_reason === "refusal") {
      throw new Error("PROVIDER_REFUSAL");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("PROVIDER_MAX_TOKENS");
    }

    const textBlock = response.content.find(
      (block) => block.type === "text" && typeof block.text === "string",
    );
    if (!textBlock?.text) {
      throw new Error("PROVIDER_EMPTY_RESPONSE");
    }

    return validateGeneratedCoachCopy(facts, JSON.parse(textBlock.text));
  }
}
