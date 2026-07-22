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
5. 한 요청만 Claude를 4초·256 tokens·재시도 0회로 호출한다.
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
구조화 출력(`output_config.format` JSON Schema, effort low, 256 tokens, 4,000ms,
재시도 0회)만 호출하고 temperature/top_p/top_k/thinking은 전달하지 않는다.
refusal·max_tokens·검증 실패를 포함한 모든 실패는 throw이며 폴백 결정은 호출자
몫이다. 프롬프트에는 수치·날짜·지역명을 넣지 않고 지역은 "우리 지역"으로만 부른다.
실데이터 저장소, `coach_cache`, `coach_generation_locks`, `llm_usage`, 예산 가드가
자동 테스트된 변경에서만 live provider와 공개 `/api/v1/coach`를 연결한다.

## 보호된 실계약 테스트

기본 CI와 `pnpm test`는 실키 없이 mock으로 통과하며 live 테스트는 skip된다.
실 `claude-opus-4-7` 계약 테스트는 명시적으로만 실행한다(1회 비용 약 USD 0.01).

```powershell
$env:LLM_CONTRACT_TEST = '1'   # 실키는 .env.local에서 읽어 환경변수로만 전달
pnpm --filter @mulsigye/llm test test/anthropic-live.contract.test.ts
```

2026-07-22 첫 실측 2회는 모두 4,000ms 애플리케이션 타임아웃으로 실패했다
(400 파라미터 거절 아님 — 호출 계약 자체는 수락됨). 타임아웃 상향은 설계 고정값
변경이므로 별도 승인 후 결정한다.

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
