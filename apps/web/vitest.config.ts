import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      // packages/llm 체인의 서버 전용 모듈을 테스트 스텁으로 치환한다.
      // "server-only"는 Next 밖(jsdom)에서 import 자체가 throw이고,
      // "@anthropic-ai/sdk"는 호출 0회를 카운터 스텁으로 강제한다(plan Task 7).
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
      "@anthropic-ai/sdk": fileURLToPath(
        new URL("./test/anthropic-sdk-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
