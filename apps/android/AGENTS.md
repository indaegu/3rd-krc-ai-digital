# apps/android 작업 규칙

읽기 순서: `../../AGENTS.md` → `../../docs/product.md` → `../../docs/architecture.md` →
`../../docs/tech-stack.md` → `../../docs/design-system.md` →
`../../docs/testing-and-feedback.md`.

- Kotlin/Jetpack Compose 네이티브 앱이며 WebView와 JavaScript 브릿지는 금지한다.
- 서버의 단계·예측·대표 저수지·코치 결과를 그대로 표시하고 Android에서 다시 계산하지 않는다.
- 네트워크 DTO 변경 전에 `../../packages/contracts/openapi.yaml`을 갱신한다.
- 앱은 Vercel `/api/v1/*`만 호출하며 Supabase·KRC·Anthropic 키를 포함하지 않는다.
- 큰 글꼴, TalkBack, 48dp 터치 목표, `~해요`체를 기본 완료 조건으로 본다.
- 완료 전 Gradle `lintDebug`, `testDebugUnitTest`, `assembleDebug`를 실행한다.
