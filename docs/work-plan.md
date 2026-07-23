# work-plan.md — 구현 순서와 완료 게이트

> 에이전트가 다음 작업을 고를 때 읽는 저장소 내부 작업 기준이다. 외부 Task Board는 보조 도구이며,
> 구현 순서·의존성·완료 조건의 SSOT는 이 문서다.

## 한 줄 전략

**계약과 실제 데이터부터 고정하고, 동일한 세로 기능 조각을 웹에서 검증한 뒤 Android로 옮긴다.**

웹과 Android를 동시에 화면 단위로 따로 만들지 않는다. 서버 계약이 없는 임시 DTO, 실제 데이터와
연결되지 않은 완성형 화면, 플랫폼별 예측 로직 복제는 금지한다.

## 우선순위

### P0 — 7월 31일 제출 필수

- KRC 데이터 5종 확보·정규화·출처 표시
- 주소의 시군 → 우리 지역 대표 저수지 매칭
- 평년 대비 저수율 14일 예측·다음 단계 가능 시점·백테스트
- 온보딩 → 동의 → 지역 등록 → 메인 → 상세의 웹·Android 플로우
- 단계별 행동 3개와 LLM 장애 시 정적 폴백
- Vercel·Supabase 배포, 서명 APK 설치 URL·QR, 제출 서류

### P1 — P0가 검증된 뒤에만

- Android App Links
- Google Play 프로덕션 공개 전환
- 만수위 접근 시 참고 배너의 추가 폴리시
- 발표용 데모 시나리오 전환 도구

### 범위 밖

회원가입·로그인, 모든 알림(푸시·로컬·문자·이메일), 실시간 채팅, 작물별 관수량, 급수 일정 최적화,
WebView, 기상청 장기예보 결합.

## 의존 순서

```text
0. 외부 준비
   ↓
1. 저장소 스캐폴드·공용 계약
   ↓
2. KRC 데이터 파이프라인·Supabase
   ↓
3. 예측·백테스트·코치 폴백
   ↓
4. 웹 세로 기능 조각
   ↓
5. Android 세로 기능 조각
   ↓
6. 교차 플랫폼 QA·배포·제출
```

앞 단계의 완료 게이트를 통과하지 못하면 다음 단계에서 임시값으로 우회하지 않는다.

## 단계별 완료 게이트

### 0. 외부 준비

**필요 항목:** KRC API 활용신청, Juso API 키, KRC 연간 CSV 4종, Supabase 프로젝트,
Vercel 프로젝트, Android application ID·서명키·배포 계정, Anthropic 어댑터·cache/lock·
USD 5 예산 가드·정적 폴백·보호된 계약 평가, 저작재산권 문의.

**완료:** `.env.local`에 필요한 키가 있고 `.env.example`에는 이름만 있으며, Android 서명키가
저장소 밖에 백업되어 있다. LLM 키가 없어도 정적 코치 폴백으로 단계 3까지 진행할 수 있다.

### 1. 저장소 스캐폴드·공용 계약

**산출물:** `apps/web`, `packages/contracts/openapi.yaml`, `apps/android`,
`infra/supabase/migrations`, `.github/workflows/verify.yml`, 실제 검증 명령.

**완료:** health OpenAPI 계약 일치, 웹 호출, Android repository/UI, 루트 JS 검사
(harness/format/openapi/lint/typecheck/test/build), Android CI가 모두 통과한 뒤에만
완료로 표시한다. `docs/testing-and-feedback.md`의 `스캐폴드 대기` 명령을 실제 실행해
`동작`으로 바꾼다.

### 2. KRC 데이터 파이프라인·Supabase

**산출물:** `reservoirs`, `reservoir_observations`, `regional_drought_daily`,
`official_outlooks` 테이블과 정규화 스크립트.

**완료:** 대표 3개 시군의 주소가 결정적으로 하나의 대표 저수지에 매칭되고, 수위 API 장애 시
Supabase 최신 스냅샷, 그마저 없으면 커밋된 제출 스냅샷으로 폴백한다.

**게이트 통과(2026-07-22):** 대표 3개 시군(논산 44230→탑정, 나주 46170→나주호,
기장 26710→병산)의 resolve 10회 반복 결정성과 status 3단 폴백 HTTP 200 유지를
`apps/web/test/stage2-gate.test.ts`로 검증했고, 원격 Supabase 4개 테이블 적재 행 수가
`data/load-report.json`과 일치함을 확인했다.

### 3. 예측·백테스트·코치 폴백

**산출물:** `avgRatio` 후보 모델 4종, 도달 가능 시점 계산, 백테스트 JSON,
단계별 정적 행동 세트, 선택한 LLM 어댑터.

**완료:** 7일·14일 홀드아웃 MAE가 재현되고 `docs/prediction-model.md` 결과 절에 실제 수치가 있다.
LLM 키가 없어도 모든 단계에서 행동 3개가 반환된다.

**게이트 통과(2026-07-22):** `pnpm backtest` 재실행 시 지표 값이 커밋된
`data/backtest-report.json`과 동일하게 재현됐고(diff는 runAt·gitCommit만),
채택 모델 naive(MAE7 1.9168 / MAE14 2.8337 %p)의 수치가
`docs/prediction-model.md` 결과 절과 일치함을 `apps/web/test/stage3-gate.test.ts`
(리포트 Zod 스키마 + 문서-리포트 드리프트 가드)로 검증했다. 같은 게이트 테스트에서
5개 공인 단계 × 대표 3개 시군(논산 44230·나주 46170·기장 26710) 15케이스 전부
`ANTHROPIC_API_KEY` 없이 정적 코치가 행동 3개를 반환하고, 도달일 예제 2개
(68/-0.45→18일, 46/-0.67→9일)를 재검증했다. AnthropicCoachProvider는
실 계약 테스트(`LLM_CONTRACT_TEST=1`, claude-opus-4-7 구조화 출력) 1회 성공을
확인했다. 공개 `/api/v1/coach`의 live 연결은 단계 4 Task 9에서 완료했다(아래 참조).

### 4. 웹 세로 기능 조각

**구현 순서:** 지역 검색·대표 저수지 → 메인 상태 → 평년 대비 흐름 상세 → 온보딩·동의 → 폴리시.

**완료:** 실제 API로 4개 상태와 지연 폴백을 시연하고 375px·큰 글꼴·키보드·reduced motion QA를 통과한다.

**게이트 자동화분 통과(2026-07-23):** 온보딩·동의·지역 등록·메인·흐름 상세(`/trend`)·폴리시
웹 플로우를 구현하고, 4개 상태(정상·가뭄 진행·심각 임박·장마 만수위)와 지연 폴백(stale)을
계약 정합 데모 픽스처(`packages/contracts/examples/{status,forecast}.*-demo.json` +
`status.stale.json`)로 스텁해 실제 화면 컴포넌트를 렌더하는 `apps/web/test/stage4-gate.test.ts`
(14 케이스)로 검증했다: ① 4개 상태 메인 전체 트리가 product.md 상태 표(rate·avgRatio·단계
칩·도달일·만수위 배너·행동 3개)와 일치, ② stale에서 지연 안내 + HTTP 200 경로 유지,
③ 카피 감사(금지 단정 표현·"가까운 저수지"·알림·로그인 0건, 공식 우선 고지 존재), ④ 접근성
자동화분(heading 순서·아이콘 버튼 접근 이름·차트 aria-label·키보드 접근·reduced-motion 분기).
루트 `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @mulsigye/web build &&
pnpm format:check` 전부 통과.

**미완(수동 QA):** 375px·큰 글꼴 200%·키보드·OS reduced motion 실기기 확인과 Vercel 프리뷰
실 API 시연(정상/심각/stale)·디자이너 공유는 코드로 대체할 수 없어 **이 브랜치의 PR 후
프리뷰에서 수행**한다. `docs/testing-and-feedback.md` 수동 QA 체크박스에 기록하며, 완료 전에는
단계 4를 최종 완료로 표시하지 않는다.

**Task 9 — live 코치 연결(별도 브랜치 `feat/llm-live-coach`):** 공개 `/api/v1/coach`에
`LLM_ENABLED === "true"` && `ANTHROPIC_API_KEY` 존재 시에만 도는 live 파이프라인을 연결했다
(`coach-service.ts` 분기 + `coach-cache.ts` 캐시 키·30일 TTL 조회/저장 +
`coach-guards.ts` KST 일일 한도·앱 레벨 2단계 예산·generation lock). 캐시 히트는
`mode: "cache"`, miss 해피패스는 Claude 1회 호출 후 `mode: "llm"`, 나머지 실패 경로는
전부 정적 코치 200 + spec 11절 fallbackReason으로 종료한다. `src/lib/coach`의 자동 테스트가
env 분기·캐시 히트·동시 miss ≤1회·Supabase 장애·timeout/429/refusal/max_tokens/검증
실패·일일 한도·예산 초과를 전부 mock·스텁으로 덮으며 Anthropic 호출 0회를 단언한다.
**현재 프로덕션 기본값은 `LLM_ENABLED=false`**라 공개 경로는 아직 Anthropic을 호출하지 않는다 —
활성화(Vercel Production `LLM_ENABLED=true` + `ANTHROPIC_API_KEY`, Preview 미주입)와
배포 후 실 miss 1회 확인은 이 PR 머지 직후 사람이 수행하는 별도 조치다.

### 5. Android 세로 기능 조각

**구현 순서:** 웹과 동일한 API 순서를 따른다. Compose UI와 DataStore만 플랫폼별로 구현하고
단계 판정·예측·코치 생성은 복제하지 않는다.

**완료:** 실기기에 서명 release APK를 새로 설치해 P0 플로우와 큰 글꼴·뒤로가기·오프라인 폴백을 통과한다.

**게이트 자동화분 통과(2026-07-23):** 온보딩·동의·지역 등록·메인·흐름 상세·폴리시 Android
플로우를 상태 기반 라우터(Navigation 라이브러리 없음) + Compose + DataStore(코드 2종·동의
버전만)로 구현하고, 4개 상태(정상 44230·관심 46170·경계 50110·만수위 26710)와 지연 폴백(stale)을
계약 픽스처(`apps/android/app/src/test/resources/fixtures/{status,forecast,coach}.*.json` —
`packages/contracts/examples`와 byte 동일)로 MockWebServer 서빙해 **실제 Retrofit·Repository·
ViewModel을 거쳐 `MainScreen`을 Robolectric으로 렌더**하는 `Stage5GateTest`(11 케이스)로 검증했다:
① 4개 상태 메인 전체 트리가 product.md 상태 표(rate·avgRatio·단계 칩·도달일 18일/9일/안정·만수위
배너·행동 3개)와 일치, ② stale에서 지연 안내 + 화면 유지(오류 카드로 안 바뀜), ③ 카피 감사(금지
단정 표현·"가까운 저수지"·알림·로그인 0건, 공식 우선 고지 존재), ④ 접근성 자동화분(heading
semantics·클릭 요소 접근 이름·차트 contentDescription·reduced-motion 분기), ⑤ DTO↔openapi
파싱 정합. `:app:lintDebug`·`:app:testDebugUnitTest`(167 케이스)·`:app:assembleDebug` 전부 통과.
단계 판정·예측·도달일·코치 문구·만수위 판정은 서버 값을 표시만 하고 Android에 임계 상수·예측
산식을 두지 않는다(규칙 10).

**미완(사람 Task 9 — 실기기·서명):** `apps/android/keystore.properties` 작성 후 서명 release
APK(`-PMULSIGYE_API_BASE_URL=https://3rd-krc-ai-digital-web.vercel.app/`) 실기기 신규 설치와
P0 플로우·큰 글꼴 1.3배·하드웨어/제스처 뒤로가기·TalkBack·오프라인 폴백·OS 애니메이션 삭제
확인은 코드로 대체할 수 없어 **PR 머지 후 사람이 수행**하고 `docs/testing-and-feedback.md`
수동 QA 체크박스에 기록한다. 완료 전에는 단계 5를 최종 완료로 표시하지 않는다.

### 6. 교차 플랫폼 QA·배포·제출

**준비(단계 5에서 마련):** Android `Stage5GateTest`와 웹 `stage4-gate.test.ts`가 동일 계약
픽스처값(4상태 + stale)을 쓰므로, 단계 6 웹↔Android 교차검증은 두 게이트가 같은 시군·기준시각
수치·단계·도달일·행동을 반환하는지 나란히 대조하는 것으로 시작한다.


**완료:** 동일 시군·동일 기준시각에서 웹과 Android의 수치·단계·행동이 같고, Vercel URL과
APK 설치 URL·QR을 다른 기기에서 확인한다. `docs/contest-rules.md`의 제출물 네 가지를 전부 준비한다.

## 에이전트 작업 단위

모든 구현 작업은 아래 다섯 항목을 갖춰야 시작할 수 있다.

1. 목표: 사용자에게 보이는 한 가지 결과.
2. 입력: 읽어야 할 SSOT와 앞 단계 산출물.
3. 파일: 생성·수정할 정확한 경로.
4. 검증: 먼저 실패하는 테스트와 완료 후 실행할 명령.
5. 문서: 같은 변경에서 갱신할 문서.

항목이 빠졌거나 두 단계에 걸친 작업이면 더 작게 나눈다. 완료 후 전달 방식은
[conventions.md](conventions.md)의 Git 규칙을 따른다.

## 현재 외부 작업

| 기한 | 작업 | 완료 증거 |
|---|---|---|
| 07-20 | KRC·Juso API 키 확보 | 실제 샘플 응답 저장·정규화 테스트 |
| 07-21 | Supabase·Vercel 프로젝트 생성 | 개발 환경의 health 응답 |
| 07-21 | Android application ID·서명키 생성 | 저장소 밖 keystore 백업 |
| 07-19 | LLM 제공자·모델 확정 완료 | Anthropic `claude-opus-4-7`, 승인 설계·운영 SSOT |
| 07-22 | KRC에 저작재산권 문구 문의 | 답변을 `contest-rules.md`에 기록 |
