# LLM 물관리 코치 설계

- 상태: 사용자 승인
- 승인일: 2026-07-19
- 개정 이력: 2026-07-22 — LLM 애플리케이션 timeout 4,000ms → 8,000ms 상향
  (실계약 실측 2회 모두 약 4.03초 타임아웃, 사용자 승인. SSOT는 docs/llm-coach.md —
  본문 7·11·14절의 4,000ms 표기는 원문 보존)
- 적용 범위: 제3회 KRC AI 디지털 혁신 공모전 제출·발표 시연
- 운영 기한: 2026-09-10 발표심사까지

## 1. 확정 결정

1. LLM 역할은 **A안인 통제형 동적 코치**로 한다.
2. 제공자는 Anthropic Claude API, 모델 ID는 `claude-opus-4-7`로 고정한다.
3. 모델 추론은 Anthropic 관리형 인프라에서 실행한다. Vercel과 Supabase에 모델을 직접 호스팅하지 않는다.
4. Vercel Next.js 서버만 Claude API를 호출한다. 웹과 Kotlin Android 앱은 동일한 `/api/v1/coach` 계약만 사용한다.
5. Supabase는 검증된 코치 응답 캐시와 비식별 사용량 메타데이터를 저장한다.
6. Claude Max는 로컬 개발, 프롬프트 작성, 수동 평가, `claude -p` 기반 사전 생성에만 사용한다.
7. 공개 서비스의 무로그인 사용자 요청은 Claude Max OAuth 자격증명으로 처리하지 않는다. Vercel에는 Claude Console의 `ANTHROPIC_API_KEY`만 저장한다.
8. 공모전 기간의 Claude API 추가 비용 상한은 총 USD 5로 한다. 자동 충전은 끈다.
9. 로그인, 자유 채팅, 자유 프롬프트, WebView, RAG, 벡터 데이터베이스, 도구 호출, 웹 검색, 다단계 에이전트는 범위 밖이다.
10. 실제 서비스 전환 여부가 결정되면 모델, 비용, 인증, SLA, 개인정보, 유료 인프라를 새 설계로 재검토한다.

## 2. 목표와 비목표

### 목표

- 서버가 계산한 공식 단계와 예측 결과를 고령 농업인이 이해하기 쉬운 짧은 `~해요`체로 설명한다.
- 서버가 선택한 검토 완료 행동을 왜 지금 해야 하는지 최대 3개까지 설명한다.
- LLM이 느리거나 실패하거나 예산을 초과해도 정적 코치로 같은 핵심 행동을 제공한다.
- 같은 상태의 반복 요청을 재사용해 공모전 시연 비용과 장애 가능성을 최소화한다.
- 모델·프롬프트·행동 카탈로그 버전과 평가 결과를 남겨 AI 활용 근거를 재현할 수 있게 한다.

### 비목표

- LLM이 저수율, 가뭄 단계, 도달일, 대표 저수지 또는 만수위 상태를 계산하거나 판정하지 않는다.
- LLM이 허용 행동을 새로 만들거나 행동 순서를 바꾸지 않는다.
- 사용자의 질문을 받는 상담·채팅 기능을 만들지 않는다.
- 장기 운영을 위한 멀티테넌시, 다중 모델 장애조치, 비동기 큐, 24시간 SLA를 만들지 않는다.
- Claude Max 자격증명을 배포 런타임 비용 절감 수단으로 사용하지 않는다.

## 3. 책임 경계

### 결정론적 서버가 소유하는 것

- KRC 데이터 수집·정규화와 기준시각
- 평년 대비 저수율과 공인 가뭄 단계
- 추세 예측, 다음 단계 도달 가능 시점, 백테스트 오차
- 만수위 접근 여부
- 행동 ID 선택과 우선순위
- 수치, 날짜, 단계명, 공식 전망 원문, 참고·면책 문구
- 캐시 키, 비용 차단, 폴백 결정

### Claude Opus 4.7이 소유하는 것

- 짧은 코치 헤드라인
- 숫자를 추가하지 않는 현재 상태의 쉬운 요약
- 서버가 순서대로 제공한 행동별 쉬운 이유
- 예측이 참고값임을 이해시키는 짧은 불확실성 설명

### Claude가 해서는 안 되는 것

- 입력에 없는 수치·날짜·지역 사실·기상 사실 생성
- 공식 단계 또는 예측 결과의 수정·재계산
- 허용 목록 밖 행동 제안
- 행동 ID의 추가·삭제·재정렬
- 확정 표현인 `위험합니다`, `발생합니다`, `됩니다` 사용
- 전문적인 농업·시설·안전 판단을 대신하는 표현

## 4. 배치 구조

```text
Web / Kotlin Android
        |
        v
Vercel Next.js /api/v1/coach
        |
        +--> CoachContextBuilder  -- 검증된 사실 패킷
        +--> CoachPolicy          -- 행동 ID와 순서 결정
        +--> CoachBudgetGuard     -- 활성화·기간·호출수·비용 차단
        +--> Supabase CoachCache  -- 검증 응답 우선 조회
                |
                +-- hit --> API 응답
                |
                +-- miss --> 단일 생성 권한 획득
                               |
                               v
                    AnthropicCoachProvider
                    Claude API / claude-opus-4-7
                               |
                               v
                    구조·의미 검증 후 캐시
                               |
                    실패하면 StaticCoachProvider
```

- 브라우저와 Android는 KRC, Supabase, Anthropic에 직접 연결하지 않는다.
- Anthropic API 키는 Vercel Production의 서버 전용 민감 환경변수로만 보관한다.
- Supabase 장애 시 Claude를 우회 호출하지 않는다. 호출 폭주를 막기 위해 즉시 정적 코치를 반환한다.
- LLM 실패는 사용자 요청 실패가 아니다. 유효한 정적 응답을 HTTP 200으로 반환한다.

## 5. 컴포넌트 경계

| 컴포넌트 | 단일 책임 | 주요 의존성 |
|---|---|---|
| `CoachContextBuilder` | 상태 스냅샷을 비식별 사실 패킷으로 변환 | 상태·예측 서비스 |
| `CoachPolicy` | 검토 완료 행동 ID를 최대 3개까지 순서대로 선택 | 행동 카탈로그 |
| `CoachCache` | 버전이 포함된 검증 응답 조회·저장 | Supabase 서버 클라이언트 |
| `CoachGenerationLock` | 같은 cache miss의 중복 Claude 호출 방지 | Supabase 원자적 claim |
| `CoachBudgetGuard` | 기간·일일 호출수·누적 USD 상한 검사 | 사용량 메타데이터 |
| `CoachProvider` | 제공자 독립 코치 생성 인터페이스 | 없음 |
| `AnthropicCoachProvider` | Claude Messages API 구조화 출력 호출 | Anthropic SDK |
| `StaticCoachProvider` | 모든 상태의 검토 완료 폴백 반환 | 행동 카탈로그 |
| `CoachValidator` | 스키마·행동 순서·길이·금지 표현 검사 | Zod, 정책 규칙 |
| `CoachSeedGenerator` | 로컬 Max 사용량으로 대표 상태 응답 사전 생성 | `claude -p`, 평가 픽스처 |

`CoachProvider`를 제외한 서버 정책은 Anthropic SDK 타입에 의존하지 않는다. 제공자 구현을 바꾸더라도 API 응답과 정책 테스트는 유지되어야 한다.

## 6. 데이터 흐름

### 6.1 공개 런타임

1. `/api/v1/coach?sigunCode=...`가 등록된 시군 코드인지 검증한다.
2. 서버가 동일 기준시각의 상태·예측 스냅샷을 읽는다.
3. `CoachContextBuilder`가 정확한 주소와 사용자 정보가 없는 사실 패킷을 만든다.
4. `CoachPolicy`가 행동 ID와 순서를 확정한다.
5. 버전과 상태 버킷으로 cache key를 만들고 Supabase를 조회한다.
6. hit이면 검증된 캐시를 반환한다.
7. miss이면 예산과 일일 live miss 한도를 확인한다.
8. 단일 생성 권한을 얻은 요청만 Claude API를 한 번 호출한다. 권한을 얻지 못한 동시 요청은 캐시를 한 번 더 읽고, 아직 결과가 없으면 기다리거나 추가 호출하지 않고 정적 코치를 반환한다.
9. 구조화 출력과 의미 규칙을 모두 통과한 응답만 캐시에 저장한다.
10. 시간초과, 공급자 오류, 거절, 잘린 출력, 검증 실패, 예산 초과는 모두 정적 코치로 종료한다.

### 6.2 Claude Max 기반 사전 생성

1. 고정 평가 픽스처에서 공인 단계, 계절, 도달 버킷, 추세 버킷, 만수위 참고 조합을 만든다.
2. 개발자가 로컬에서 Max 계정으로 로그인한 `claude -p`를 명시적으로 실행한다.
3. 생성 결과를 런타임과 동일한 `CoachValidator`로 검증한다.
4. 통과 결과만 `data/coach-seed.json`과 평가 보고서에 기록한다.
5. 서버 전용 seed 명령으로 Supabase `coach_cache`에 적재한다.
6. Max OAuth 토큰, Claude 세션 정보, 프롬프트 전문은 파일·CI·Vercel·Supabase에 저장하지 않는다.

사전 생성은 선택 가능한 개발 명령이며 CI에서 자동 실행하지 않는다. Max 한도 소진이나 로컬 로그인 부재가 빌드·테스트·배포를 막아서는 안 된다.
사전 생성 결과는 비용 절감용 seed이며 Claude API 계약 성공의 증거를 대신하지 않는다. 실제 API 키를 사용한 Opus 4.7 구조화 출력 계약 테스트를 별도로 통과해야 한다.

## 7. Claude 호출 계약

### 고정 설정

| 항목 | 값 |
|---|---|
| API | Anthropic Messages API |
| SDK | 공식 TypeScript SDK |
| 모델 | `claude-opus-4-7` |
| 출력 | `output_config.format` JSON Schema |
| effort | `low` |
| max tokens | 256 |
| 애플리케이션 timeout | 4,000ms |
| temperature/top_p/top_k | 전달하지 않음 |
| adaptive/extended thinking | 사용하지 않음 |
| tools/search/RAG | 사용하지 않음 |
| streaming | 사용하지 않음 |
| 동기 재시도 | 0회 |

Opus 4.7은 비기본 `temperature`, `top_p`, `top_k`를 받지 않으므로 설정 객체에도 넣지 않는다. 구조화 출력이 JSON 형식을 보장하더라도 제품 의미 규칙은 `CoachValidator`가 별도로 검증한다.

### 제공자 입력

```ts
type CoachFactPacket = {
  factSchemaVersion: "1";
  officialStage: "정상" | "관심" | "주의" | "경계" | "심각";
  season: "봄" | "여름" | "가을" | "겨울";
  reachBucket: "none" | "within_7d" | "within_14d" | "within_30d";
  trendBucket: "rising" | "stable" | "falling";
  highWaterNotice: boolean;
  officialOutlookCode: ApprovedOutlookCode | null;
  actions: Array<{
    id: string;
    approvedTitle: string;
    approvedRationale: string;
  }>;
};
```

지역명조차 문장 생성에 꼭 필요하지 않으므로 기본 패킷에서 제외하고 `우리 지역`으로 표현한다. 정확한 일수와 비율은 LLM이 아니라 서버 UI가 표시한다.
`ApprovedOutlookCode`는 서버의 검토 완료 전망 카탈로그에 등록된 코드만 허용하며 공공데이터 원문을 그대로 전달하지 않는다.

### 제공자 출력

```ts
type GeneratedCoachCopy = {
  headline: string;
  summary: string;
  actions: Array<{
    id: string;
    reason: string;
  }>;
};
```

- `headline`: 30자 이하, 한 문장
- `summary`: 100자 이하, 최대 두 문장
- `actions`: 입력과 같은 ID·개수·순서, 1~3개
- `reason`: 항목당 70자 이하, 한 문장
- 모든 사용자 노출 문장은 짧은 `~해요`체

## 8. 공개 API 응답 계약

```ts
type CoachApiResponse = {
  schemaVersion: "1";
  mode: "llm" | "cache" | "static";
  dataStale: boolean;
  cacheHit: boolean;
  generatedAt: string;
  promptVersion: string;
  actionCatalogVersion: string;
  coach: {
    headline: string;
    summary: string;
    actions: Array<{
      id: string;
      title: string;
      reason: string;
    }>;
  };
  fallbackReason:
    | "disabled"
    | "cache_unavailable"
    | "budget_exceeded"
    | "daily_limit"
    | "generation_in_progress"
    | "timeout"
    | "rate_limited"
    | "provider_error"
    | "refusal"
    | "max_tokens"
    | "validation_failed"
    | null;
};
```

- 행동 `title`은 항상 서버 행동 카탈로그에서 결합한다.
- `provider`, `model`, 토큰 수, 비용, 상세 오류는 공개 응답에 넣지 않는다.
- LLM 폴백은 HTTP 200이며 `mode: "static"`으로 관측 가능하게 한다.
- `dataStale`은 KRC 데이터의 오래됨을 뜻하며 코치 캐시 여부와 구분한다.

## 9. 캐시와 Supabase

### Cache key

아래 문자열을 정규화해 SHA-256으로 만든다.

```text
factSchemaVersion
| officialStage
| season
| reachBucket
| trendBucket
| highWaterNotice
| officialOutlookCode
| orderedActionIds
| locale
| promptVersion
| actionCatalogVersion
| provider
| model
```

- `sigunCode`, 지역명, 정확한 주소, 정확한 수치, 요청 시각은 key에서 제외한다.
- 상태·전망·행동 조합이 같으면 모든 지역이 같은 안전한 문구를 재사용한다.
- TTL은 30일이다. 버전 변경은 별도 key를 만들므로 즉시 논리적으로 무효화된다.
- 발표 이틀 전 전체 대표 조합을 다시 검증·적재한다.

### 테이블

`coach_cache`에는 다음 필드를 둔다.

- `cache_key` unique
- `fact_schema_version`, `prompt_version`, `action_catalog_version`
- `provider`, `model`
- `response_json`
- `created_at`, `expires_at`
- nullable `input_tokens`, `output_tokens`, `estimated_cost_usd`, `latency_ms`
- `validation_status`, `generation_source`

`coach_generation_locks`는 `cache_key`와 `locked_until`로 단일 생성 권한을 제공한다. `llm_usage`는 호출 시각, 모델, 토큰, 추정 비용, 지연시간, 결과 코드만 저장한다.

세 테이블 모두 RLS를 활성화하고 공개 정책을 만들지 않는다. Vercel 서버의 service role만 접근하며 사용자 식별자, IP, 주소, 프롬프트·응답 전문은 저장하지 않는다.

## 10. 비용·남용 방지

- 기존 Claude Max 구독료는 개발자가 이미 지불하는 개발도구 고정비이며 프로젝트 추가 런타임 비용으로 계산하지 않는다.
- Max 포함 사용량은 사전 생성과 수동 평가에 사용한다. 확정 금액의 API 크레딧으로 간주하지 않는다.
- Claude Console API 선불 잔액과 별도로 애플리케이션 누적 비용을 계산한다.
- 공모전 종료까지 누적 추정 비용이 USD 5에 도달하면 live miss 생성을 중단한다.
- live miss 한도는 UTC가 아닌 KST 기준 하루 20회, 동시 생성 최대 2회다.
- live miss 권한을 얻을 때 건당 USD 0.02를 원자적으로 먼저 예약하고, 응답 usage로 실제 비용을 기록한 뒤 차액을 반환한다. 예약 후 총액이 USD 5를 넘는 호출은 시작하지 않는다.
- 등록되지 않은 시군 코드와 임의 입력은 Claude 호출 전에 거절한다.
- cache miss 상황에서 Supabase가 불안정하면 Claude를 호출하지 않는다.
- API 자동 충전은 비활성화하고 Console에도 보수적인 지출 한도를 설정한다.
- API 키는 2026-09-11 만료로 만들거나 2026-09-10 발표 직후 수동 폐기한다.

실측 토큰과 비용은 평가 보고서에서 갱신한다. 설계 시점의 비교 기준은 입력 900토큰과 출력 220토큰일 때 cache miss 약 USD 0.01이다.

### 공모전 인프라 운영

- Vercel과 Supabase는 먼저 무료 플랜을 사용한다. 장기 실서비스를 전제로 미리 유료 전환하지 않는다.
- Supabase 무료 프로젝트 중지 위험을 줄이기 위해 하루 한 번 서버 전용 health check를 실행하고 결과를 기록한다.
- 제출 전, 발표 7일 전, 발표 전날에 Vercel·Supabase·Anthropic·KRC 연결과 정적 폴백을 수동 점검한다.
- Vercel 무료 플랜의 공모전 사용 허용 여부를 제출 전에 최신 약관으로 확인한다.
- 무료 플랜으로 발표 안정성을 충족하지 못한다는 실측 근거가 있을 때만 발표 기간 한 달의 유료 전환을 별도 결정한다.

## 11. 오류 처리

| 상황 | 서버 동작 |
|---|---|
| API 키 없음 또는 LLM 비활성 | 정적 코치 200 |
| 캐시 hit | 캐시 코치 200 |
| 캐시 만료 | miss로 처리하되 예산·lock 검사 |
| Supabase 오류 | Claude 미호출, 정적 코치 200 |
| 같은 key 생성 중 | 추가 호출 없이 정적 코치 200 |
| 4초 timeout | 요청 중단, 정적 코치 200 |
| Anthropic 429 | 재시도 없이 정적 코치 200 |
| Anthropic 4xx/5xx | 재시도 없이 정적 코치 200 |
| refusal 또는 max_tokens | 저장하지 않고 정적 코치 200 |
| JSON·Zod·의미 검증 실패 | 저장하지 않고 정적 코치 200 |
| 누적 비용·일일 한도 초과 | 제공자 미호출, 정적 코치 200 |

클라이언트는 `mode`에 따라 화면 구조를 바꾸지 않는다. 코치 출처와 관계없이 동일한 행동 카드 계약을 렌더링한다.

## 12. 개인정보와 로그

Claude 입력과 런타임 로그에 다음을 넣지 않는다.

- 주소 원문, 주소 검색어, 위경도
- 사용자의 등록 지역 목록
- IP, 기기 ID, 광고 ID
- 약관 동의 상태
- 자유 입력 또는 채팅 내용
- KRC 원본 응답 전체

로그에는 `contextHash`, cache hit/miss, `mode`, 지연시간, 입력·출력 토큰, 추정 비용, 검증 결과, 폴백 사유만 남긴다. 프롬프트와 응답 전문은 런타임 로그에 남기지 않는다.

## 13. 평가와 테스트

### 고정 평가 집합

- 정상, 관심, 주의, 경계, 심각의 모든 공인 단계
- 봄, 여름, 가을, 겨울
- 7일 이내, 14일 이내, 30일 이내, 도달 없음
- 상승, 안정, 하락 추세
- 만수위 참고 있음·없음
- API 키 없음, timeout, 429, 5xx, refusal, max_tokens, 잘못된 JSON
- 캐시 hit, miss, 만료, 동시 miss, Supabase 장애, 예산 초과

모든 조합의 데카르트 곱을 매번 호출하지 않는다. 정책 분기를 모두 덮는 최소 pairwise 고정 사례와 발표 대표 시나리오 4개를 사용한다.

### 합격 기준

- JSON Schema와 Zod 통과율 100%
- 입력과 출력 행동 ID·개수·순서 일치율 100%
- 허용하지 않은 행동 생성 0건
- 새 수치·날짜·단정 표현 생성 0건
- 개인정보가 provider payload와 로그에 포함된 사례 0건
- 모든 provider·cache·budget 실패에서 정적 폴백 성공률 100%
- cache hit에서 Anthropic 호출 0회
- 같은 key의 동시 miss에서 Anthropic 호출 최대 1회
- 총 비용 상한 이후 Anthropic 호출 0회

### 증거 산출물

`artifacts/llm/coach-eval-report.json`에 다음을 기록한다.

- git commit, 평가 시각
- model, prompt version, action catalog version, fact schema version
- 고정 사례별 검증 결과와 폴백 결과
- p50/p95 지연시간
- 입력·출력 토큰, 건당·전체 추정 비용
- 캐시 적중률과 live miss 수

실제 provider 계약 테스트는 명시적 환경변수를 켠 로컬 또는 보호된 CI 작업에서만 수행한다. 기본 PR 테스트는 API 키 없이 fixture와 mock으로 통과해야 한다.

## 14. 환경변수

```dotenv
LLM_ENABLED=false
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-4-7
LLM_PROMPT_VERSION=coach-v1
LLM_ACTION_CATALOG_VERSION=actions-v1
LLM_TIMEOUT_MS=4000
LLM_MAX_TOKENS=256
LLM_DAILY_LIVE_MISS_LIMIT=20
LLM_CONTEST_BUDGET_USD=5
```

- `.env.example`에는 이름과 안전한 기본값만 기록한다.
- `ANTHROPIC_API_KEY`는 로컬 `.env.local`과 Vercel 민감 환경변수에만 둔다.
- `CLAUDE_CODE_OAUTH_TOKEN`과 Max 로그인 정보는 애플리케이션 환경변수로 정의하지 않는다.
- Preview 배포에는 실제 production API 키를 주입하지 않고 fixture 또는 정적 코치를 사용한다.

## 15. 문서·프로토타입 동기화 범위

구현 계획에서는 새 SSOT인 `docs/llm-coach.md`를 만들고 다음 문서를 함께 갱신한다.

- `AGENTS.md`: LLM 문서 라우팅과 절대 경계
- `README.md`: 제한형 이중 AI 설명
- `docs/product.md`: 통제형 동적 코치와 자유 채팅 제외
- `docs/architecture.md`: Anthropic 외부 추론, Vercel 오케스트레이션, Supabase 캐시
- `docs/tech-stack.md`: SDK·모델·구조화 출력·Max/API 경계
- `docs/prediction-model.md`: 정량 예측과 자연어 설명의 책임 분리
- `docs/testing-and-feedback.md`: LLM 계약·안전·비용·폴백 게이트
- `docs/work-plan.md`, `docs/milestones.md`: 구현·평가·프롬프트 동결 일정
- `.env.example`: Claude와 비용 차단 환경변수
- `prototype/`: 채팅 암시 버튼과 실행 전 임의 오차 제거

## 16. 공모전 이후 재설계 조건

실제 서비스를 추진할 때는 이 문서를 그대로 운영 설계로 승격하지 않는다. 다음을 다시 결정한다.

- 실제 사용자 수와 월 예산에 따른 모델 재선정
- 로그인·권한·개인정보 처리와 약관
- rate limit, WAF, 관측성, SLA, 장애조치
- Supabase·Vercel 유료 플랜과 데이터 보존 정책
- Max 사전 생성 제거 여부와 정식 배치 파이프라인
- 다중 제공자 또는 소형 모델 전환
- 자유 질문이 필요할 경우 별도의 안전 설계와 평가

## 17. 구현 완료 조건

1. 실제 `claude-opus-4-7` 구조화 출력 호출이 최소 1개 고정 사례에서 성공한다.
2. 웹과 Android가 동일한 코치 API 응답을 렌더링한다.
3. cache hit, live miss, 정적 폴백 세 경로가 자동 테스트된다.
4. 누적 USD 5와 일일 20 live miss 한도가 provider 호출 전에 적용된다.
5. Max OAuth 자격증명이 저장소, CI, Vercel, Supabase에 없다.
6. `artifacts/llm/coach-eval-report.json`이 재현 가능하게 생성된다.
7. 발표 대표 시나리오가 사전 생성되어 provider 장애 중에도 동작한다.
8. LLM 관련 SSOT와 연결 문서가 서로 충돌하지 않는다.
9. 무료 인프라 health check와 발표 전 점검 절차가 실행 가능한 명령으로 문서화된다.

## 18. 공식 참고 자료

- [Claude 모델 상태](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- [Claude 모델 가격](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude 구조화 출력](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Claude effort 설정](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Claude API 인증](https://platform.claude.com/docs/en/manage-claude/authentication)
- [Claude Max 플랜](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)
- [Claude Code와 Max 사용](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Agent SDK 크레딧 변경 보류](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [구독 자격증명과 제3자 앱 정책](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)
- [Claude API 결제 방식](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage)
- [Supabase 무료 프로젝트 중지 정책](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Vercel Functions 제한](https://vercel.com/docs/functions/limitations)
