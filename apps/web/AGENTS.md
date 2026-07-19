# apps/web 작업 규칙

읽기 순서: `../../AGENTS.md` → `../../docs/product.md` → `../../docs/architecture.md` →
`../../docs/tech-stack.md` → UI 작업이면 `../../docs/design-system.md` →
`../../docs/testing-and-feedback.md`.

- 이 폴더는 Next.js UI와 Vercel Route Handlers만 소유한다.
- 브라우저 코드는 KRC, Supabase, Anthropic을 직접 호출하지 않는다.
- 새 HTTP 필드·경로는 `../../packages/contracts/openapi.yaml`을 먼저 바꾼다.
- 서버 도메인 계산은 `src/lib/data`, `src/lib/prediction`에 두고 React 컴포넌트에 넣지 않는다.
- 로그인, 알림, WebView를 암시하는 화면이나 카피를 만들지 않는다.
- 완료 전 `pnpm --filter @mulsigye/web lint`, `typecheck`, `test`, `build`를 각각 실행한다.
