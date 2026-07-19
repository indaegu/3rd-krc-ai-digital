# packages/contracts 작업 규칙

이 폴더의 `openapi.yaml`이 웹·Android HTTP 계약의 SSOT다.

- 계약을 먼저 수정하고 Redocly lint와 TypeScript 생성을 통과시킨 뒤 두 클라이언트를 바꾼다.
- 기존 `/api/v1` 응답의 의미를 조용히 바꾸지 않는다. 비호환 변경은 `/api/v2`로 낸다.
- `rate`와 `avgRatio`, `%`와 `%p`, nullable, ISO 8601, 오류의 `retryable`을 명시한다.
- 생성된 `src/generated/openapi.ts`를 손으로 수정하지 않는다.
- 완료 전 `pnpm --filter @mulsigye/contracts generate`, `lint`, `typecheck`, `test`를 각각 실행한다.
