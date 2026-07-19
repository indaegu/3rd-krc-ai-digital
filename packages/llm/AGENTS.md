# packages/llm 작업 규칙

읽기 순서: `../../AGENTS.md` → `../../docs/llm-coach.md` →
`../../docs/superpowers/specs/2026-07-19-llm-coach-design.md`.

- 서버 전용 패키지다. React, Next.js UI, Android, Supabase 구체 클라이언트 타입에 의존하지 않는다.
- Claude는 단계·수치·도달일·행동 ID·행동 순서를 생성하거나 변경하지 않는다.
- 모델은 `claude-opus-4-7`, 구조화 출력, effort low, 256 tokens, 4초, 동기 재시도 0회다.
- 캐시·lock·예산 가드 없이 Anthropic provider를 공개 Route Handler에 연결하지 않는다.
- 키 없음, timeout, 429, provider/검증 실패는 검토 완료 정적 코치로 종료한다.
- Max OAuth 토큰과 프롬프트·응답 전문을 저장소, CI, Vercel, Supabase에 넣지 않는다.
