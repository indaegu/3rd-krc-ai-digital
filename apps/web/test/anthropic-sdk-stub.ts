// vitest 전용 스텁 — "@anthropic-ai/sdk" 모듈 mock.
// 공개 코치 경로는 Anthropic을 어떤 경로로도 호출하지 않는다(plan Task 7).
// 생성·호출 횟수를 카운터로 기록해 테스트가 0회를 단언한다.

export const anthropicSdkCalls = {
  constructed: 0,
  messagesCreated: 0,
};

export function resetAnthropicSdkCalls(): void {
  anthropicSdkCalls.constructed = 0;
  anthropicSdkCalls.messagesCreated = 0;
}

export default class AnthropicStub {
  messages = {
    create: async (): Promise<never> => {
      anthropicSdkCalls.messagesCreated += 1;
      throw new Error("공개 코치 경로에서 Anthropic 호출 금지");
    },
  };

  constructor() {
    anthropicSdkCalls.constructed += 1;
  }
}
