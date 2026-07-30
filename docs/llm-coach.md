# llm-coach.md — 통제형 동적 물관리 코치

> LLM 구현·평가·운영 전에 읽는 SSOT다. 설계 근거와 승인 이력은
> `docs/superpowers/specs/2026-07-19-llm-coach-design.md`에 있다.

## 고정 결정

- Anthropic Claude API의 `claude-opus-4-7`을 사용한다.
- 추론은 Anthropic에 있고 Vercel Next.js 서버가 호출을 오케스트레이션한다.
- 웹과 Android는 `/api/v1/coach`만 소비하며 Anthropic을 직접 호출하지 않는다.
- Claude Max는 로컬 개발·수동 평가·사전 생성에만 사용한다.
- 공개 런타임은 Claude Console의 `ANTHROPIC_API_KEY`를 사용한다.
- 공모전 종료까지 live API 누적 상한은 USD 5, KST 일일 miss는 20회다.
- 실서비스를 추진할 때 인증, 모델, 비용, SLA, 개인정보를 새로 설계한다.

## 책임 경계

서버는 KRC 사실, 공인 단계, 예측, 정확한 수치·날짜, 행동 ID·순서, 면책 문구를 확정한다.
Claude는 숫자를 추가하지 않는 짧은 헤드라인·요약·행동 이유만 `~해요`체로 생성한다.
행동 ID·개수·순서 불일치, 새 숫자·날짜, 금지 단정 표현은 검증 실패다.

## 런타임 순서

1. 등록된 시군 코드와 동일 기준시각의 상태·예측을 검증한다.
2. 비식별 `CoachFactPacket`과 검토 완료 행동 최대 3개를 만든다.
3. 버전 포함 cache key로 Supabase를 조회한다.
4. miss일 때 예산·일일 한도·동시 생성 lock을 먼저 획득한다.
5. 한 요청만 Claude를 8초·256 tokens·재시도 0회로 호출한다.
6. 구조와 의미를 모두 통과한 응답만 30일 캐시한다.
7. 비활성·키 없음·Supabase 장애·예산 초과·provider/검증 실패는 정적 코치 200이다.

## 부트스트랩 현재 경계

`packages/llm`에는 타입, Zod 검증기, 정적 provider, Anthropic 모델 상수,
행동 카탈로그 `actions-v1`, CoachPolicy를 둔다. 카탈로그는 공인 단계 5종 × 3개에
만수위 참고 `hw_check_drain`을 더한 검토 완료 행동 16개이며, 코치 행동 카피의
유일한 출처다. CoachPolicy `selectActions(stage, highWaterNotice)`는 항상 정확히
3개를 결정적 순서로 고르고, 만수위 참고면 배수로 점검이 1순위가 된다.
`AnthropicCoachProvider`와 프롬프트 `coach-v1`(`coach-prompt.ts`)도 packages/llm에
있지만 **어떤 공개 라우트에도 연결되어 있지 않다**. 어댑터는 `claude-opus-4-7` +
구조화 출력(`output_config.format` JSON Schema, effort low, 256 tokens, 8,000ms,
재시도 0회)만 호출하고 temperature/top_p/top_k/thinking은 전달하지 않는다.
refusal·max_tokens·검증 실패를 포함한 모든 실패는 throw이며 폴백 결정은 호출자
몫이다. 프롬프트에는 수치·날짜·지역명을 넣지 않고 지역은 "우리 지역"으로만 부른다.
실데이터 저장소, `coach_cache`, `coach_generation_locks`, `llm_usage`, 예산 가드가
자동 테스트된 변경에서만 live provider와 공개 `/api/v1/coach`를 연결한다.

## 공개 경로 현재 상태 — live 연결(기본은 정적)

공개 `GET /api/v1/coach?sigunCode=`는 배포되어 있으며 **live 파이프라인이 연결**됐다.
`apps/web/src/lib/coach/coach-service.ts`는 기본은 정적 코치를 조립하고,
`LLM_ENABLED === "true"` **그리고** `ANTHROPIC_API_KEY`가 있을 때만 live 파이프라인을
탄다. 두 조건 중 하나라도 아니면 Anthropic을 구성조차 하지 않고 정적 코치 200
(`mode: "static"`, `cacheHit: false`, `fallbackReason: "disabled"`)을 반환한다.
**현재 프로덕션 기본값은 `LLM_ENABLED=false`**라 공개 경로는 Anthropic을 호출하지
않으며, 활성화는 Vercel Production env(`LLM_ENABLED=true` + `ANTHROPIC_API_KEY`,
Preview 미주입)를 사람이 설정하는 별도 조치다 — 절차는 아래
[프로덕션 활성화 절차](#프로덕션-활성화-절차-사람-작업) 절에 있다. 클라이언트는
mode로 화면 구조를 바꾸지 않는다.

- 사실 조립: `apps/web/src/lib/coach/coach-context.ts`가 status·forecast 결과를
  비식별 `CoachFactPacket`(단계 라벨·계절·reach/trend 버킷·만수위 참고,
  `officialOutlookCode`는 이번 단계 `null` 고정)으로 만들고, 행동 3개는
  CoachPolicy `selectActions`가 확정한다. 패킷에 sigunCode·지역명·수치가 없음을
  테스트로 강제한다.
- 만수위 참고 판정: status-service가 관측 폴백 3단(수위 API → Supabase 최신 관측
  → 커밋 스냅샷) 각각에서 확보한 원저수율 시계열로 `isHighWaterNotice`를 계산해
  `StatusResponse.highWaterNotice`로 확정한다. 코치는 이 값을 그대로 옮겨 담고
  수위 시계열을 재조회하거나 재판정하지 않는다(판정 위치는 status 하나).
- live 파이프라인(설계 spec 6.1 순서): 캐시 키(SHA-256, sigunCode·수치·시각 제외)로
  `coach_cache` 조회 → hit이면 `mode: "cache"` → miss면 KST 일일 miss 한도(기본 20)와
  누적 USD 예산(기본 5, 건당 0.02 선예약, 예약 후 합계 초과면 예약 회수) 확인 →
  `coach_generation_locks` 단일 생성 권한(TTL 15초) 획득 → 권한을 얻은 한 요청만
  Claude를 8초·256 tokens·재시도 0회로 1회 호출 → 검증 통과분만 30일 캐시 후
  `mode: "llm"`. 권한을 못 얻은 동시 요청은 캐시를 한 번 더 읽고, 없으면 추가 호출
  없이 정적(`generation_in_progress`)으로 종료한다. `apps/web/src/lib/coach/
  coach-cache.ts`(키·조회·저장)와 `coach-guards.ts`(한도·예산·lock)가 이를 나눠 맡는다.
- 폴백 매핑(spec 11절): 비활성·키 없음 → `disabled`, Supabase 장애(어느 단계든) →
  `cache_unavailable`, 일일 한도 → `daily_limit`, 예산 초과 → `budget_exceeded`,
  생성 중 → `generation_in_progress`, timeout → `timeout`, 429 → `rate_limited`,
  기타 4xx/5xx → `provider_error`, refusal → `refusal`, max_tokens → `max_tokens`,
  JSON·Zod·의미 검증 실패 → `validation_failed`. 모든 실패에서 HTTP 200 + 행동 3개를
  유지하고, provider 예외를 payload·로그에 남기지 않는다(비식별 메타만).
- 게이트: 기본 실행(LLM_ENABLED 미설정·키 없음)에서 5개 공인 단계 전부 행동 3개를
  HTTP 200으로 반환하고, `@anthropic-ai/sdk` 스텁 카운터로 호출 0회를 단언한다.
  live 파이프라인 분기·캐시·lock·예산·폴백은 `src/lib/coach`의 자동 테스트가
  전부 mock·스텁으로 덮으며 실 Anthropic/Supabase를 호출하지 않는다.

## 프로덕션 활성화 절차 (사람 작업)

키를 다루는 단계라 사람이 직접 수행한다. 아래 순서를 그대로 따르고, 어느 단계든 확인이
실패하면 6단계(되돌리기)로 간다.

### 1. 넣을 환경변수

Vercel 프로젝트 → Settings → Environment Variables. **Environment는 Production만 선택한다**
(Preview·Development에 키를 넣으면 프리뷰 배포마다 실키를 태운다).

| 이름 | 값 | 비고 |
|---|---|---|
| `LLM_ENABLED` | `true` | 이 값이 문자열 `"true"`가 아니면 정적 코치로 남는다 |
| `ANTHROPIC_API_KEY` | 발급받은 키 | Sensitive로 표시 |
| `LLM_CONTEST_BUDGET_USD` | `5` | 생략 시 기본 5 |
| `LLM_DAILY_LIVE_MISS_LIMIT` | `20` | 생략 시 기본 20 |
| `ANTHROPIC_MODEL` | 생략 | 생략하면 `claude-opus-4-7` |

키는 저장소·릴리스·이슈·PR 어디에도 올리지 않는다. `.env` 파일을 만들어 커밋하지 않는다.

### 2. 재배포

환경변수는 **새 배포에만 적용된다.** Deployments → 최신 Production 배포 → Redeploy.
"Use existing Build Cache"는 꺼도 되고 켜도 된다(코드 변경이 없으므로).

### 3. 활성화 확인

```powershell
curl.exe -s "https://3rd-krc-ai-digital-web.vercel.app/api/v1/coach?sigunCode=44230"
```

- `fallbackReason`이 `"disabled"`에서 **사라지면(`null`) 또는 다른 값으로 바뀌면** 활성화됐다.
- `mode`가 `"llm"`이면 실제 생성, `"cache"`면 캐시 재사용이다.
- `mode`가 `"static"`이고 `fallbackReason`이 `"disabled"`면 **환경변수가 적용되지 않았다** —
  Environment 선택(Production)과 재배포 여부를 다시 본다.

### 4. 실패 경로 확인 (중요)

활성화의 목적은 live 경로를 보여주는 것이지만, 심사 중 장애가 나도 화면이 유지돼야 한다.
아래를 확인한다.

- 같은 지역을 두 번 부르면 두 번째는 `mode: "cache"`다(30일 캐시가 도는지).
- 다른 시군 몇 곳을 불러도 행동이 항상 3개다.
- `fallbackReason`이 `budget_exceeded`·`daily_limit`으로 바뀌어도 HTTP 200이고 행동 3개다.
  (일부러 만들지 말고, 값이 그렇게 나올 때 화면이 멀쩡한지만 본다.)

### 5. 비용 확인

- Anthropic 콘솔 Usage에서 누적 비용이 예산(USD 5) 안인지 본다.
- Supabase `llm_usage` 테이블에 호출별 토큰·비용·결과 코드가 쌓인다. 앱 레벨 가드가
  이 테이블을 근거로 예산을 예약하므로, 여기가 비어 있으면 가드가 동작하지 않는 것이다.
- 예산이 소진되면 자동으로 정적 코치로 떨어진다. 화면은 그대로 동작한다.

### 6. 되돌리기

`LLM_ENABLED`를 `false`로 바꾸고 재배포한다. 키는 지우지 않아도 된다 — 두 조건이 모두
참일 때만 live로 가므로 이 한 값만으로 즉시 정적 코치로 돌아간다. 코드 변경도, 배포
롤백도 필요 없다.

### 심사 기간 주의

- 발표심사(2026-09-10)까지 이 환경변수를 지우지 않는다.
- 제출 전·발표 7일 전·발표 전날에 3단계 확인을 한 번씩 다시 한다.

## 보호된 실계약 테스트

기본 CI와 `pnpm test`는 실키 없이 mock으로 통과하며 live 테스트는 skip된다.
실 `claude-opus-4-7` 계약 테스트는 명시적으로만 실행한다(1회 비용 약 USD 0.01).

```powershell
$env:LLM_CONTRACT_TEST = '1'   # 실키는 .env.local에서 읽어 환경변수로만 전달
pnpm --filter @mulsigye/llm test test/anthropic-live.contract.test.ts
```

관측 기록: 2026-07-22 첫 실측 2회는 당시 고정값 4,000ms 타임아웃으로 실패했다
(각 약 4.03초에 중단, 400 파라미터 거절 아님 — 호출 계약 자체는 수락됨).
이 실측을 근거로 사용자 승인을 받아 타임아웃을 8,000ms로 상향했다(2026-07-22).
8,000ms 재실측 1회는 약 5.8초에 응답을 받았으나 `stop_reason: "max_tokens"`
(출력 256 tokens 상한 도달)로 검증 전 실패했다. 이에 coach-v1 프롬프트에 출력
분량 지시(headline 15자 안팎·summary 60자 안팎·reason 40자 안팎)를 추가했고,
같은 날 실호출 1회가 약 4.4초에 성공해 validator 통과·행동 ID 보존을 확인했다 —
설계 spec 17절 1항(실 `claude-opus-4-7` 구조화 출력 고정 사례 1개 성공) 충족.

## 보안과 로그

주소 원문, 지역 목록, IP, 기기 ID, 자유 입력, KRC 원문 전체를 provider payload와 로그에 넣지 않는다.
로그에는 context hash, cache hit/miss, mode, 지연, 토큰, 추정 비용, 검증 결과, 폴백 사유만 남긴다.
Max OAuth 토큰, Claude 세션, 프롬프트·응답 전문은 저장하지 않는다.

## 검증 게이트

- 입력과 출력 행동 ID·개수·순서 일치율 100%
- 새 수치·날짜·단정 표현 0건
- 모든 cache·budget·provider 실패에서 정적 폴백 100%
- cache hit에서 Anthropic 호출 0회
- 같은 key 동시 miss에서 Anthropic 호출 최대 1회
- 누적 USD 5 이후 Anthropic 호출 0회
- 기본 PR CI는 API 키 없이 fixture와 mock으로 통과
- 실제 Opus 4.7 계약 테스트는 명시적으로 보호된 수동 작업에서만 실행
