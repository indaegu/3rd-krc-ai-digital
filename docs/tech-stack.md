# tech-stack.md — 기술 스택과 선택 이유

> 라이브러리 추가 전에 읽는다. 아래 선택은 스캐폴드에 필요한 결정을 끝낸 상태다.
> 정확한 패치 버전은 스캐폴드 당일 호환되는 안정 조합으로 잠그고 lockfile·Version Catalog에 기록한다.

## 웹·서버

| 영역 | 확정 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router | 웹 UI와 Route Handler를 한 저장소·Vercel 배포로 운영 |
| 언어 | TypeScript strict | 공공데이터 필드·단위 오류를 타입으로 차단 |
| 스타일 | CSS Modules + 전역 CSS 변수 | 프로토타입 토큰을 단순하게 이식, 런타임 CSS 의존 없음 |
| 폰트 | Pretendard Variable self-host | CDN 없이 동일한 한글 시각 품질 |
| 차트 | 직접 그린 SVG | 실측·예측·불확실 밴드를 작게 정확히 표현 |
| 검증 | ESLint + Prettier + TypeScript + Vitest | 정적 검사·단위 테스트를 빠르게 반복 |
| 패키지 | pnpm + Corepack | 단일 lockfile과 재현 가능한 설치 |
| 데이터 파싱 | `fast-xml-parser` + 내장 CSV 파서 또는 최소 CSV 패키지 | KRC API XML을 명시적으로 파싱; CSV는 스캐폴드 때 표본으로 결정 |
| 런타임 검증 | Zod | 외부 XML/CSV·환경변수·Route 응답 경계 검증 |
| API 계약 | OpenAPI 3.1 + Redocly CLI | 웹·Android DTO와 오류 계약의 SSOT·CI 린트 |
| 데이터베이스 | Supabase PostgreSQL + `@supabase/supabase-js` + Supabase CLI | 공개 데이터 스냅샷·예측/코치 캐시·마이그레이션 |
| 예측·백테스트 | TypeScript 순수 함수 + Node CLI | 서비스와 백테스트가 같은 계산을 재사용 |
| 웹 로컬 저장 | localStorage | 로그인 없이 지역 코드·대표 시설 코드·동의 버전만 기기 저장 |
| 배포 | Vercel | `main` 프로덕션, PR 프리뷰, Route Handler 운영 |

## Android

| 영역 | 확정 선택 | 이유 |
|---|---|---|
| 언어·UI | Kotlin + Jetpack Compose | WebView 없이 네이티브 UI·접근성 구현 |
| 구조 | ViewModel + Repository + 단방향 UI 상태 | 네트워크·저장소와 화면을 분리해 테스트 가능 |
| 네트워크 | Retrofit + OkHttp + kotlinx.serialization | `/api/v1/*` JSON 계약 소비 |
| 비동기 | Coroutines + Flow | API·DataStore 결과를 Compose 상태로 연결 |
| 로컬 저장 | Jetpack DataStore | 지역 코드·대표 시설 코드·동의 버전만 기기 저장 |
| SDK | `minSdk 26`, `compileSdk 36`, `targetSdk 36` | 지원 범위를 과도하게 넓히지 않고 Android 16·Play 기준 대비 |
| 빌드 버전 | 호환되는 안정 JDK·Kotlin·Compose·AGP를 Version Catalog에 정확히 고정 | 스캐폴드 후 문서와 실제 빌드의 불일치 방지 |
| 배포 | 동일 서명키의 release APK + Play용 AAB | 심사용 설치와 최종 네이티브 배포를 함께 준비 |
| 딥링크 | Android App Links(P1) | 앱 설치 시 Compose 화면, 미설치 시 웹 폴백 |

## LLM 코치 전략

- 제공자 선택은 비차단 결정이다. `CoachProvider` 어댑터 뒤에 둬서 나중에 교체한다.
- 먼저 단계별 정적 행동 세트를 구현한다. LLM이 없거나 실패해도 핵심 시연이 동작해야 한다.
- LLM에는 지역명·서버가 계산한 단계·도달 가능 시점·허용 행동 ID만 전달한다.
- 자유 질문, 사용자 임의 프롬프트, 위험 판정, 단계 재판정은 허용하지 않는다.
- 출력은 Zod로 “인사 1문장 + 행동 최대 3개”를 검증하고 실패하면 정적 문구로 폴백한다.
- 제공자·모델·프롬프트 버전은 7/22까지 확정해 이 문서와 환경변수 예시를 갱신한다.

## 플랫폼 연결 원칙

- 웹과 Android는 화면 코드를 공유하지 않고 `/api/v1/*` OpenAPI 계약을 공유한다.
- 예측, 공식 단계, KRC 정규화, 대표 저수지 결정, LLM 호출은 서버에서만 수행한다.
- Android는 Vercel API 기준 URL만 `BuildConfig`로 받는다.
- WebView·JavaScript 브릿지를 사용하지 않는다. App Links는 핵심 플로우 이후 구현한다.
- CSS 변수와 Compose Theme는 [design-system.md](design-system.md)의 같은 토큰 이름·의미를 따른다.

## Supabase 사용 범위

- 사용: KRC 시설·관측·지역 가뭄·공식 전망 데이터, 예측 결과, 코치 응답 캐시.
- 사용하지 않음: Auth, 사용자 계정, 주소 원문, 등록 지역·동의 내역의 서버 동기화.
- 접근: Next.js Route Handler와 서버 스크립트만. 브라우저·Android 직접 접근 금지.
- 비밀값: `SUPABASE_SECRET_KEY`는 Vercel·로컬 비밀 환경변수에만 둔다.

## 금지

- 차트 라이브러리(recharts, chart.js 등) 추가 금지. SVG 직접 렌더가 확정이다.
- CSS 프레임워크(Tailwind 포함)와 CSS-in-JS 추가 금지. CSS Modules를 사용한다.
- Redux/Zustand 등 전역 상태 라이브러리 추가 금지. React 상태 + localStorage로 충분하다.
- Moment류 날짜 라이브러리 금지. `Date` + `Intl`, 필요할 때 `date-fns` 개별 함수만 검토한다.
- WebView, JavaScript 브릿지, 클라이언트의 KRC·Supabase·LLM 직접 호출 금지.
- Android에 서버 비밀값, keystore, 서명 비밀번호를 포함하거나 커밋하지 않는다.
- 플랫폼별 예측·단계·대표 저수지 선정 로직 복제 금지.
- Auth·로그인·알림 라이브러리를 추가하지 않는다.

## 버전 고정 원칙

- `package.json`에는 정확한 버전을 쓰고 `pnpm-lock.yaml`을 커밋한다.
- Node·pnpm 버전은 `package.json`의 `engines`·`packageManager`와 `.nvmrc`에 기록한다.
- Android 의존성은 `android/gradle/libs.versions.toml`에 정확한 버전으로 모은다.
- 도구 버전을 올리면 웹 `lint/typecheck/test/build`와 Android `lint/test/assemble`을 모두 실행한다.
- 새 의존성을 추가하면 이 문서의 선택·이유와 [testing-and-feedback.md](testing-and-feedback.md)의
  검증 명령을 같은 변경에서 갱신한다.

## 공식 기술 기준

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Jetpack Compose 개요](https://developer.android.com/develop/ui)
- [Android 16 SDK 설정](https://developer.android.com/about/versions/16/setup-sdk)
- [Google Play 대상 API 수준 정책](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Supabase 데이터 보안](https://supabase.com/docs/guides/database/secure-data)
- [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys)
