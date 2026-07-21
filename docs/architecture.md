# architecture.md — 시스템 구조

> 새 파일·모듈을 만들기 전에 읽는다. 스택 상세는 [tech-stack.md](tech-stack.md),
> 데이터 의미는 [data-sources.md](data-sources.md), 작업 순서는 [work-plan.md](work-plan.md)가 SSOT다.

## 전체 구조

```
[Next.js 웹]                         [Android 네이티브 앱]
  App Router + CSS Modules            Kotlin + Jetpack Compose
  localStorage                        DataStore
          │ HTTPS                           │ HTTPS
          └──────────────┬──────────────────┘
                         ▼
                 [Next.js on Vercel]
                   ├─ Web UI
                   ├─ Route Handlers (/api/v1/*)
                   │    ├─ regions/search   주소 후보 검색
                   │    ├─ regions/resolve  시군구·대표 저수지 결정
                   │    ├─ status           현재 저수율·공식 단계
                   │    ├─ forecast         추세 예측·도달 가능 시점
                   │    └─ coach            제한된 행동 코칭
                   ├─ apps/web/src/lib/data        페치·정규화·대표지 결정·캐시
                   └─ apps/web/src/lib/prediction  결정적인 순수 함수
                         │
          ┌──────────────┼──────────────────┐
          ▼              ▼                  ▼
 [KRC 공공데이터 5종] [Supabase PostgreSQL] [LLM 어댑터]
  API(XML)+연간 CSV    공개 데이터 스냅샷     정적 폴백 우선
                       예측·코치 캐시
```

- Android는 웹을 감싼 앱이 아니라 독립적인 Compose 네이티브 클라이언트다.
- UI 코드는 공유하지 않는다. 디자인 토큰, OpenAPI 계약, 도메인 용어를 공유한다.
- 예측·단계 판정·KRC 정규화·LLM 호출은 서버에서 한 번만 구현한다.
- 로그인·회원가입·Supabase Auth는 사용하지 않는다.

## 서버 모듈 경계

```text
packages/contracts
      ↑
packages/llm (server-only policy/provider boundary)
      ↑
apps/web/src/lib/data + apps/web/src/lib/prediction
      ↑
apps/web/src/app/api/v1
      ↑ HTTPS
apps/web browser UI + apps/android
```

- 웹 UI와 Android는 모두 `/api/v1/*`만 호출한다. KRC·Supabase·LLM에 직접 연결하지 않는다.
- `apps/web/src/lib/data` 밖에서 원천 필드명을 직접 해석하거나 단계 기준을 복제하지 않는다.
- `apps/web/src/lib/prediction`은 `(시계열, 옵션) → { 예측값, 도달일, 오차 }`인 순수 함수다.
  네트워크·현재 시간·랜덤에 접근하지 않아 단위 테스트와 백테스트가 재현 가능해야 한다.
- Route Handler는 DTO 변환, 캐시 정책, 오류 매핑을 담당한다. UI 문구를 데이터 소스에 넣지 않는다.

## 웹 ↔ Android 브릿지 전략

브릿지는 WebView JavaScript 인터페이스가 아니라 **버전이 고정된 HTTPS API 계약**이다.

- 계약 SSOT: `packages/contracts/openapi.yaml`(OpenAPI 3.1). DTO, enum, ISO 8601 날짜, `%`와 `%p`,
  nullable, 오류 형식을 정의한다.
- 호환성을 깨는 변경은 `/api/v2`처럼 새 버전으로 낸다. 기존 응답 의미를 조용히 바꾸지 않는다.
- 웹은 동일 출처 Route Handler를 `fetch`, Android는 Retrofit/OkHttp와
  kotlinx.serialization로 같은 JSON 계약을 소비한다.
- Android 기준 URL은 `BuildConfig`에 주입한다. 프로덕션은 Vercel, 개발은 로컬·프리뷰 URL이다.
- App Links는 **P1**이다. 핵심 플로우가 완성된 뒤 안정된 웹 경로와 Compose 화면을 연결한다.
  앱이 없으면 같은 웹 경로로 열린다.
- 디자인 토큰은 [design-system.md](design-system.md)에서 CSS 변수와 Compose Theme로 각각 옮긴다.

## API 책임

| 경로 | 입력 | 책임 | 주의 |
|---|---|---|---|
| `GET /api/v1/regions/search` | 주소 검색어 | 주소 API 결과를 최소 필드로 정규화 | 원문을 로그·DB에 저장하지 않음 |
| `POST /api/v1/regions/resolve` | 선택 주소의 행정코드 | 시군구와 대표 저수지를 결정 | 수혜면적 최대, 동률은 시설코드 오름차순 |
| `GET /api/v1/status` | `sigunCode` | 대표 저수지 원저수율 + 지역 `avgRatio` + 공식 단계 | 두 저수율의 의미를 분리, 3단 폴백으로 HTTP 200 유지 |
| `GET /api/v1/forecast` | `sigunCode` | 14일 예측, 오차, 도달 가능 시점, 공식 전망 | 참고 표현만 반환 |
| `GET /api/v1/coach` | `sigunCode` | 서버가 상태를 조회해 허용 행동 안에서 코칭 | 임의 프롬프트 입력 금지 |

### 공통 응답·오류 원칙

- 성공 응답에는 `asOf`, `sources`, `stale`을 포함한다.
- 외부 API 장애 때 마지막 정상 데이터가 있으면 `stale: true`와 지연 안내를 반환한다.
- 복구 불가능한 오류는 `{ code, message, retryable }`와 알맞은 HTTP 상태를 반환한다.
- 클라이언트는 서버의 단계·예측 결과를 그대로 표시하고 자체 기준을 만들지 않는다.

## 데이터 흐름

1. 주소 검색 결과에서 행정 시군구 코드를 얻는다. 주소 원문은 응답 후 폐기한다.
2. `reservoirs`에서 같은 시군구의 수혜면적 최대 시설을 대표 저수지로 결정한다.
   Supabase 조회가 실패하면 커밋 스냅샷으로 폴백한다(`stale: true`).
3. KRC 수위 API(XML)에서 대표 저수지의 현재 원저수율을 조회하고 60분 캐시한다.
   status의 관측 폴백 순서는 3단으로 고정한다:
   **① 수위 API → ② Supabase `reservoir_observations` 최신(`stale: true`) →
   ③ 커밋 스냅샷(`stale: true`, sources에 스냅샷 기준일 명시)** — 어느 단이든 HTTP 200을 유지한다.
4. `regional_drought_daily`의 최신 `avgRatio`와 공식 단계를 조회한다(실패 시 커밋 스냅샷).
5. 같은 지역 `avgRatio` 시계열을 예측 함수에 넣고 공식 전망을 병기한다.
6. 상태와 허용 행동 목록으로 코치 응답을 만들며, LLM 장애 시 정적 문구를 반환한다.

정적 CSV는 연간 갱신 데이터다. 프로젝트 시작과 최종 제출 직전에 수동 적재·검증하고,
원천 갱신일이 바뀐 경우에만 다시 적재한다. 의미 없는 일일 cron을 만들지 않는다.

## Supabase 스키마 경계

| 테이블 | 핵심 키·값 | 용도 |
|---|---|---|
| `reservoirs` | `fac_code` PK, 이름, 시군구 코드, 주소, 수혜면적 | 대표 저수지 결정 |
| `reservoir_observations` | `fac_code + observed_on`, 원저수율·수위 | 현재 조회 스냅샷·폴백 |
| `regional_drought_daily` | `sigun_code + observed_on`, 통합·평년·평년대비·공식 단계 | 예측과 단계의 주계열 |
| `official_outlooks` | `sigun_code + published_on`, 현재·1/2/3개월 전망 | 자체 예측 옆 공식 근거 |
| `forecast_runs` | 지역·기준일·모델 버전, 예측·오차 | 재계산 방지·재현성 |
| `coach_cache` | 상태·정책·모델 버전 hash, 검증 응답, 만료·비용 메타데이터 | 30일 검증 응답 재사용 |
| `coach_generation_locks` | `cache_key`, `locked_until` | 같은 miss의 중복 Claude 호출 방지 |
| `llm_usage` | context hash, 모델, 토큰, 비용, 지연, 결과 코드 | USD 5·일일 20회 가드 증거 |

세 LLM 테이블은 RLS를 활성화하고 공개 정책을 만들지 않는다. Next.js 서버의 service role만
접근하며 사용자 식별자, IP, 주소, 프롬프트·응답 전문을 저장하지 않는다.

- 사용자 주소, 등록 지역, 동의 내역은 Supabase에 저장하지 않는다.
- 웹은 `localStorage`, Android는 DataStore에 지역 코드·대표 시설 코드·동의 버전만 저장한다.
- Next.js 서버만 `SUPABASE_SECRET_KEY`로 접근한다. 클라이언트 번들에는 Supabase 키를 넣지 않는다.
- 마이그레이션은 `infra/supabase/migrations/`에 추가하며 적용 순서를 되돌려 쓰지 않는다.

## 폴더 구조

```
apps/web/src/app/            Next.js 페이지
apps/web/src/app/api/v1/     버전이 고정된 Route Handlers
apps/web/src/components/     UI 컴포넌트(Gauge*, Coach*, Region*)
apps/web/src/lib/data/       외부 페치·XML/CSV 정규화·대표지 결정·캐시
apps/web/src/lib/prediction/ 모델·도달일 계산 순수 함수
apps/web/scripts/            데이터 적재 CLI(build-data.ts) — lib/data 모듈 재사용
packages/contracts/          OpenAPI 계약
packages/llm/                서버 전용 코치 provider·검증
data/                        제출 시점의 검증된 정적 스냅샷·적재 리포트
scripts/                     크로스 워크스페이스 검사(하네스·문서·프로토타입)만
infra/supabase/              DB 마이그레이션·pgTAP 테스트
apps/android/                Kotlin + Compose 프로젝트
docs/                        지식 베이스
prototype/                   인터랙티브 시각 참고물
```

루트 `pnpm build:data`는 `--filter @mulsigye/web`로 `apps/web/scripts/build-data.ts`에
위임한다(Node 24 네이티브 TS 실행). 정규화·격리·대표지 결정 로직은 전부
`apps/web/src/lib/data` 모듈에 있고 CLI는 파일 읽기·upsert·리포트 조립만 한다.
`scripts/`(루트)에는 워크스페이스 밖 검사만 남긴다.

## 배포

- Vercel 프로젝트 1개, `main` = 프로덕션, PR 브랜치 = 프리뷰 배포다.
- Supabase 프로젝트 1개를 사용하고 스키마는 마이그레이션으로 관리한다.
- 서버 환경변수:

```text
DATA_GO_KR_API_KEY, JUSO_API_KEY,
SUPABASE_URL, SUPABASE_SECRET_KEY,
LLM_ENABLED, ANTHROPIC_API_KEY, ANTHROPIC_MODEL,
LLM_PROMPT_VERSION, LLM_ACTION_CATALOG_VERSION,
LLM_TIMEOUT_MS, LLM_MAX_TOKENS,
LLM_DAILY_LIVE_MISS_LIMIT, LLM_CONTEST_BUDGET_USD
```

- Android는 같은 application ID와 서명키로 release APK와 Play용 AAB를 만든다.
- keystore, 비밀번호, `keystore.properties`, `local.properties`는 커밋하지 않는다.
- 7/31 제출물의 서비스 URL·QR에서 웹과 설치 가능한 Android 결과물로 접근할 수 있게 한다.
- Vercel 서비스 URL은 발표 심사일인 9/10까지 유지한다.

## 남은 비차단 결정

- [ ] Android App Links: 핵심 화면 경로가 고정된 뒤 P1에서 연결.
