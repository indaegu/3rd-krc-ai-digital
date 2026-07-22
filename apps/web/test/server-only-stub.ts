// vitest 전용 스텁 — packages/llm의 `import "server-only"`를 무해화한다.
// Next 런타임에서는 실제 "server-only" 패키지가 클라이언트 번들 유입을 차단한다.
export {};
