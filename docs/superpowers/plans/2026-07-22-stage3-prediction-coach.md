# Mulsigye 단계 3 — 예측·백테스트·코치 폴백 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans로 Task 단위 실행. 체크박스(`- [ ]`)로 진행을 추적한다.

- 상태: 사용자 승인 (2026-07-22)
- 작성일: 2026-07-22
- 확정 결정: live 코치 연결 = 단계 4 마지막 Task / 실 Anthropic 계약 테스트 = Task 6에서 실행 / forecast_runs 테이블 안 만듦 / 예측 상수는 플랜 제안값 채택
- 근거 SSOT: `docs/prediction-model.md`(모델 4종·백테스트 프로토콜·도달일 산식 확정), `docs/llm-coach.md` + `docs/superpowers/specs/2026-07-19-llm-coach-design.md`(코치 계약·폴백·가드), `docs/product.md`(참고 표현·카피 규칙), AGENTS.md 절대 규칙 3·5·10

**Goal:** 논가뭄지도 `avgRatio` 시계열로 naive/ma7/linear/ses 4종 순수 함수 예측 모델을 구현하고, 1년치 원CSV로 7일·14일 홀드아웃 MAE 백테스트를 재현 가능하게 실행해 `data/backtest-report.json`과 `docs/prediction-model.md` 결과 절에 실측 수치를 기록한다. 다음 단계 도달 가능 시점(`reachBucket`)을 계산해 `/api/v1/forecast`로 노출하고, 행동 카탈로그 `actions-v1`(단계 5종 × 3개 + 만수위 참고)과 `AnthropicCoachProvider`(claude-opus-4-7, 미연결)를 갖춘 뒤, `/api/v1/coach`를 **정적 코치 전용 경로**(LLM_ENABLED=false, Anthropic 미호출)로 노출한다. 완료 게이트: `pnpm backtest` 재실행 시 동일 MAE가 재현되고, LLM 키가 전혀 없어도 5개 공인 단계 전부에서 행동 3개가 HTTP 200으로 반환된다.

**Architecture:** 예측은 `apps/web/src/lib/prediction/`의 결정적 순수 함수(네트워크·현재시간·랜덤 접근 금지 — architecture.md 계약)로만 구현하고, 백테스트 CLI는 `apps/web/scripts/backtest.ts`가 기존 `lib/data/normalize-drought-map.ts`를 재사용해 `data/raw` 원CSV에서 직접 읽는다(스냅샷 60일은 프로토콜의 180일 요건 미달 — 아래 판단 참조). 계약은 `packages/contracts/openapi.yaml`에 `ForecastResponse`·`CoachResponse`를 v1 호환 확장으로 먼저 추가한다. 행동 카탈로그·CoachPolicy·AnthropicCoachProvider는 `packages/llm`에 두되, **packages/llm AGENTS.md 규칙("캐시·lock·예산 가드 없이 Anthropic provider를 공개 Route Handler에 연결하지 않는다")에 따라 이번 단계의 공개 `/api/v1/coach`는 StaticCoachProvider만 실행**하고(`mode: "static"`, `fallbackReason: "disabled"`), live 경로 연결은 캐시·lock·예산 가드가 자동 테스트되는 별도 변경으로 남긴다. `CoachContextBuilder`(상태·예측 → 비식별 `CoachFactPacket`)는 `apps/web/src/lib/coach/`에 두어 packages/llm이 웹 데이터 모듈에 의존하지 않게 한다.

**Tech Stack:** 새 의존성 없음. `@anthropic-ai/sdk 0.112.3`(이미 packages/llm에 고정), zod 4.4.3, vitest 4.1.10, Node 24 네이티브 TS 실행(backtest CLI). Anthropic 호출 계약은 설계 spec 고정값: Messages API + `output_config.format`(JSON Schema, 길이 제약은 스키마에 넣지 않고 CoachValidator가 검증), effort `low`, max_tokens 256, per-request timeout 4,000ms(TS SDK는 ms 단위), `maxRetries: 0`, temperature/top_p/top_k/thinking 미전달(Opus 4.7은 비기본 샘플링 파라미터를 400으로 거절).

## prediction-model.md에 이미 확정된 것 vs 이 플랜이 새로 설계한 것

**이미 확정(그대로 따름):**
- 후보 모델 4종의 이름·정의·역할(naive/ma7/linear/ses), 파일 위치 `apps/web/src/lib/prediction/models.ts`, 입력 `number[]` → 출력 14일 `number[]`
- 백테스트 프로토콜 전체: 유효 관측 180일 이상 시군, 마지막 90일 내 14일 간격 rolling origin, 데이터 누수 금지, MAE/RMSE(%p), 지역별 지표 + macro average, **기본 모델 = 14일 macro MAE 최저, 차이 0.05%p 이하면 더 단순한 모델**, 제외 지역 사유 기록, 리포트 경로 `data/backtest-report.json`(원천 체크섬·실행시각·git commit·파라미터·표본 수), 재현 명령 `pnpm backtest`
- 도달일 산식: `d<0 && r0>t → days=ceil((r0-t)/|d|)`, 임계값 70/60/50/40, 심각이면 계산 안 함, 1~30일만 숫자 표시, 검증 예제 2개(68,-0.45→18 / 46,-0.67→9)
- 불확실성 표기: 잔차 충분 시 horizon별 경험적 10~90 분위수 밴드, 부족 시 최근 14일 MAE ±X.X%p + 밴드 산식 API 메타데이터
- 만수위 참고: 대표 저수지 원저수율 `rate>=95` + 원저수율 상승 추세일 때만
- LLM 책임 분리, CoachFactPacket/GeneratedCoachCopy/CoachApiResponse 계약 전체(설계 spec)

**새로 설계(문서에 없어 이 플랜이 정의 — 같은 커밋에서 prediction-model.md에 기록):**
- 이름 있는 상수 값: `LINEAR_WINDOW_DAYS = 14`, `SES_ALPHA = 0.3`, `MODEL_VERSION = "pred-v1"` (프로토콜은 "N·평활계수는 상수와 모델 버전에 포함"만 요구, 값은 미정)
- "더 단순한 모델" 동률 판정 순서: `naive < ma7 < ses < linear` (단순성 서열 명시)
- 일일 변화량 `d`의 통일 정의: `d = (forecast[13] − r0) / 14` (모델 독립적 — naive/ma7는 자연히 0)
- `trendBucket` 판정: `|d| < 0.05 %p/day → stable`, 음수 → falling, 양수 → rising (`TREND_STABLE_EPSILON = 0.05`)
- `reachBucket` 매핑: days 없음→`none`, ≤7→`within_7d`, ≤14→`within_14d`, ≤30→`within_30d`
- 결측 제외 규칙 상수: `MIN_VALID_DAYS = 180`(문서값), `MAX_GAP_DAYS = 7`(학습 구간 내 연속 결측 7일 초과 지역·origin 제외 — 신규)
- `season` 판정: KST 월 기준 3–5 봄 / 6–8 여름 / 9–11 가을 / 12–2 겨울
- CoachPolicy 규칙: 단계별 3개 순서 고정, `highWaterNotice=true`면 배수로 점검 행동이 1순위로 들어가고 해당 단계 1·2순위가 뒤따름(총 3개 유지)

## 백테스트 데이터 범위 판단 (스냅샷 60일 vs 원CSV 1년)

**원CSV 1년치 채택.** 프로토콜이 "유효 관측 180일 이상 + 마지막 90일 rolling origin"을 요구하므로 커밋 스냅샷(전 시군 최근 60일, 9,240행)으로는 origin을 하나도 만들 수 없다. `data/raw/한국농어촌공사_논가뭄지도_20251231.csv`(2025-01-01~12-31, 60,955행, 167시군; placeholder·stage_mismatch 격리 후 ≈154시군 — Supabase 적재분과 동일 파이프라인)를 기존 `normalizeDroughtMap`으로 읽으면 지역당 origin ~6개 × ~150지역 ≈ 900+ 평가점이 나와 horizon별 잔차 분위수 밴드까지 산출 가능하다. `data/raw`는 gitignore 대상이므로 `pnpm backtest`는 `pnpm build:data`처럼 **개발 PC 수동 명령**이고, 재현성은 리포트의 SHA-256 원천 체크섬 + 커밋된 `data/backtest-report.json` + CI용 픽스처 단위테스트로 보장한다. 주의: 격리(stage_mismatch 등)로 생기는 중간 결측은 `MAX_GAP_DAYS` 규칙으로 처리하고 제외 지역·사유를 리포트에 남긴다(프로토콜 6항).

## Global Constraints

- **참고 표현만(AGENTS 규칙 3).** 서버는 숫자·버킷·단계만 반환하고 문장을 만들지 않는다(architecture.md "UI 문구를 데이터 소스에 넣지 않는다"). 코치 카피는 검토 완료 카탈로그 문구만 사용하며 "위험합니다/발생합니다/됩니다/내려가요" 금지 — CoachValidator + 카탈로그 테스트로 강제.
- **공인 단계 기준 단일 출처(규칙 5).** 임계값·단계 매핑은 `apps/web/src/lib/data/drought-stage.ts`만 import한다. prediction 모듈에 70/60/50/40을 복제하지 않는다.
- **예측 입력은 지역 `avgRatio`만.** 대표 저수지 원저수율 `rate`는 예측에 넣지 않는다(만수위 참고 판정에만 사용). 두 값의 의미를 절대 섞지 않는다.
- **순수 함수 계약.** `lib/prediction/*`는 `(시계열, 옵션) → 값`이며 Date.now/네트워크/랜덤 접근 금지. `now`가 필요한 조립 계층(서비스)은 `deps.now` 주입 패턴(status-service와 동일)을 따른다.
- **LLM 경계(규칙 10 + packages/llm AGENTS.md).** 이번 단계의 공개 라우트는 어떤 경로로도 Anthropic을 호출하지 않는다. AnthropicCoachProvider는 packages/llm 내부에서만 테스트되고, 실 API 계약 테스트는 `LLM_CONTRACT_TEST=1` + 실키가 있을 때만 수동 실행한다(기본 PR CI는 키 없이 통과). Max OAuth 자격증명·프롬프트 전문을 저장소·로그에 넣지 않는다.
- **개인정보.** CoachFactPacket에 sigunCode·지역명·주소·정확한 수치를 넣지 않는다(설계 spec 캐시 키 규칙과 동일한 비식별 수준). 테스트로 강제.
- **문서 동기화(규칙 7).** 각 Task의 코드와 문서 갱신을 같은 커밋에 담는다. 특히 `prediction-model.md` 결과 절은 Task 2 커밋에 실측 수치로 채운다.
- **계약 v1 호환 확장만.** 기존 스키마 의미를 바꾸지 않고 경로·스키마를 추가한다.
- 작업 브랜치 `feat/stage3-prediction-coach`에서 검증·커밋·푸시 후 `main` 대상 PR(규칙 9).

## 고정 계약 DTO (v1 확장)

```ts
export type ForecastPoint = { observedOn: string; avgRatio: number };
export type ForecastBandPoint = { observedOn: string; avgRatio: number; low: number; high: number };

export type ForecastResponse = {
  schemaVersion: "1";
  sigunCode: string;
  sigunName: string;
  basis: { observedOn: string; avgRatio: number; officialStage: DroughtStage }; // 최신 실측
  history: ForecastPoint[];            // 최근 30일 실측(실선)
  forecast: ForecastBandPoint[];       // 14일 예측(점선) + 밴드
  trend: { dailyDelta: number; bucket: "rising" | "stable" | "falling" };   // %p/day
  reach: {
    days: number | null;               // 1~30만 숫자, 그 외 null("안정")
    bucket: "none" | "within_7d" | "within_14d" | "within_30d";
    targetStage: DroughtStage | null;  // 다음 단계(심각이면 null)
  };
  model: { name: "naive" | "ma7" | "linear" | "ses"; version: string;
           mae7: number; mae14: number;
           bandMethod: "residual_quantile_p10_p90" | "recent_mae" };
  officialOutlook: {                    // 공식 전망 병기(발행일 포함, null 가능)
    publishedOn: string;
    current: DroughtStage; outlook1m: DroughtStage; outlook2m: DroughtStage; outlook3m: DroughtStage;
  } | null;
  asOf: string; sources: string[]; stale: boolean;
};

// CoachResponse = 설계 spec 8절 CoachApiResponse를 그대로 계약화 (mode/dataStale/cacheHit/
// generatedAt/promptVersion/actionCatalogVersion/coach{headline,summary,actions[{id,title,reason}]}/fallbackReason)
```

---

### Task 1: 예측 순수 함수 — 모델 4종·도달일·버킷·만수위 (`apps/web/src/lib/prediction/`)

**Files:**
- Create: `apps/web/src/lib/prediction/models.ts` (naive/ma7/linear/ses, `LINEAR_WINDOW_DAYS=14`, `SES_ALPHA=0.3`, `MODEL_VERSION="pred-v1"`, `MODEL_SIMPLICITY_ORDER`, `dailyDelta(r0, forecast)` 공통 함수)
- Create: `apps/web/src/lib/prediction/reach.ts` (`daysToNextStage(r0, d, officialStageCode)` — drought-stage.ts 임계값 import, `toReachBucket(days)`, `toTrendBucket(d)` + `TREND_STABLE_EPSILON=0.05`)
- Create: `apps/web/src/lib/prediction/high-water.ts` (`isHighWaterNotice(rateSeries: number[]): boolean` — 최신 rate>=95 && 상승 추세; 원저수율 전용, avgRatio 입력 금지 주석)
- Create: `apps/web/src/lib/prediction/season.ts` (`seasonOf(kstDate: string)`)
- Test: `apps/web/src/lib/prediction/models.test.ts`, `reach.test.ts`, `high-water.test.ts`, `season.test.ts`
- Modify: `docs/prediction-model.md` (상수 값·d 통일 정의·trend/reach 버킷 정의·단순성 서열을 해당 절에 추가 — 결과 절은 아직 비움)

**Interfaces:** `predict(model, series: number[]) → number[14]` 결정적. 입력 14일 미만이면 명시적 에러(모델별 최소 길이 상수). 소비자: Task 2 백테스트, Task 4 forecast 서비스, Task 7 코치.

- [ ] **Step 1: 실패하는 테스트 먼저** — testing-and-feedback.md 최소 범위 그대로:
  - 고정 입력에 대한 naive/ma7/linear/ses 수치 테스트(손계산 가능한 짧은 시계열; linear는 완전 선형 입력에서 정확 외삽, ses는 alpha=0.3 손계산값).
  - 도달일: `68, -0.45 → 18`, `46, -0.67 → 9`, `d=0`·상승 → null, `r0`가 임계값과 같음/바로 아래, 30일 초과 → null, 심각 단계 → null.
  - 버킷: days 7/8/14/15/30/null 경계 전부, d=±0.05 경계.
  - 만수위: rate 95.0+상승 → true, 95+하락 → false, 94.9 → false.
  - 결정성: 같은 입력 2회 호출 동일 출력.

  Run: `pnpm --filter @mulsigye/web test src/lib/prediction` → Expected: FAIL(모듈 없음)
- [ ] **Step 2: 구현 후 검증**

  Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test`  → Expected: PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add apps/web/src/lib/prediction docs/prediction-model.md
  git commit -m "feat(web): avgRatio 예측 모델 4종과 도달일·버킷 순수 함수"
  ```

---

### Task 2: 백테스트 하네스 — `pnpm backtest` + 리포트 커밋 + 결과 절 실측 기입

**Files:**
- Create: `apps/web/src/lib/prediction/backtest.ts` (순수 엔진: `(지역별 시계열 map, 파라미터) → BacktestReport` — rolling origin 생성, 미래값 차단, 모델별 7·14일 MAE/RMSE, 지역별+macro, 선택 규칙(14일 macro MAE 최저, 0.05%p 이내면 단순성 서열), 선택 모델의 horizon별 잔차 p10/p90, 제외 지역·사유)
- Create: `apps/web/src/lib/prediction/backtest-report.ts` (리포트 Zod 스키마: sourceChecksum, runAt, gitCommit, modelParams, 표본·origin 수, 모델별 지표 표, selectedModel, residualQuantiles[1..14], excluded[])
- Create: `apps/web/scripts/backtest.ts` (CLI: `data/raw/한국농어촌공사_논가뭄지도_20251231.csv` → `decodeCp949`/`normalizeDroughtMap` 재사용 → 엔진 → `data/backtest-report.json` 기록 + 콘솔 요약. Node 24 네이티브 TS, 상대 경로 import — build-data.ts와 동일 패턴)
- Modify: `apps/web/package.json` (`"backtest": "node scripts/backtest.ts"`), 루트 `package.json` (`"backtest": "pnpm --filter @mulsigye/web backtest"`)
- Test: `apps/web/src/lib/prediction/backtest.test.ts` (합성 픽스처 기반 — CI에서 원CSV 없이 통과)
- Generated(커밋 대상): `data/backtest-report.json`
- Modify: `docs/prediction-model.md` **결과 절** (체크리스트 5항목 전부: 스냅샷 체크섬, 지역·origin 수·제외 내역, 모델별 7·14일 MAE/RMSE 표, 채택 모델·파라미터·근거, 리포트 커밋), `docs/testing-and-feedback.md` (`pnpm backtest` → `동작`, "data/raw 필요·수동 명령" 명시)

**Interfaces:** Consumes Task 1 모델 + 기존 `normalize-drought-map`. Produces: 커밋된 리포트(Task 4가 `model.mae7/mae14`·잔차 분위수를 import), 문서 결과 절.

- [ ] **Step 1: 실패하는 엔진 테스트 먼저** — 합성 시계열(완전 선형 하강 지역, 상수 지역, 노이즈 지역, 179일짜리 제외 대상 지역, 8일 결측 갭 지역)로:
  - origin이 마지막 90일 안에서 14일 간격으로 생성되고 학습 창에 origin 이후 값이 없음(누수 차단 단언).
  - 완전 선형 지역에서 linear MAE ≈ 0, naive MAE = 기울기 기반 손계산값.
  - 179일 지역 → `excluded(reason: "insufficient_days")`, 8일 갭 → `excluded(reason: "long_gap")`.
  - 동률(차이 ≤0.05%p) 시 단순성 서열로 선택.
  - 같은 입력 → 지표 값 바이트 동일(결정성; runAt/gitCommit 제외 비교).

  Run: `pnpm --filter @mulsigye/web test src/lib/prediction/backtest.test.ts` → Expected: FAIL → 구현 후 PASS
- [ ] **Step 2: 실데이터 실행·리포트 커밋**

  Run: `pnpm backtest` (1회) → `pnpm backtest` (2회차, MAE 동일 재현 확인 — 게이트 조건)

  Expected: `data/backtest-report.json` 생성, 콘솔 요약(지역 ≈150·origin 수·모델별 MAE·채택 모델). 두 실행의 지표 값 동일.
- [ ] **Step 3: 결과 절 기입 후 전체 검증** — 리포트의 실제 수치를 `docs/prediction-model.md` 결과 절에 표로 기입(임의 수치 금지 — 리포트 값만 복사).

  Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm format:check` → Expected: PASS
- [ ] **Step 4: Commit**
  ```powershell
  git add apps/web package.json data/backtest-report.json docs/prediction-model.md docs/testing-and-feedback.md
  git commit -m "feat(web): 논가뭄지도 1년치 백테스트 하네스와 실측 MAE 리포트"
  ```

---

### Task 3: OpenAPI 계약 확장 — `/api/v1/forecast`·`/api/v1/coach`

**Files:**
- Modify: `packages/contracts/openapi.yaml` (위 DTO — `ForecastResponse`, `CoachResponse`, `DroughtStage` 재사용; 오류는 기존 `ApiError` 400/404/503; coach 200 예시에 `mode: "static"`, `fallbackReason: "disabled"` 포함)
- Create: `packages/contracts/examples/forecast.ok.json`, `forecast.stable.json`(reach.days=null·bucket=none), `coach.static.json`
- Modify: `packages/contracts/src/index.ts` / Generate: `packages/contracts/src/generated/openapi.ts`
- Test: `packages/contracts/test/forecast-contract.test.ts`, `coach-contract.test.ts`

**Interfaces:** Consumes 기존 계약 스타일(`schemaVersion`/`asOf`/`sources`/`stale`). Produces: Task 4·7이 소비할 생성 타입. 주의: forecast 예시 수치는 product.md 상태 4종과 계산이 맞아야 함(예: avgRatio 68, d=-0.45 → reach.days 18).

- [ ] **Step 1: 실패하는 계약 테스트 먼저** (`satisfies` 검사 + 예시 JSON) — Run: `pnpm --filter @mulsigye/contracts test` → Expected: FAIL
- [ ] **Step 2: openapi.yaml 추가 → 재생성·검증**

  Run: `pnpm --filter @mulsigye/contracts generate && pnpm openapi:lint && pnpm --filter @mulsigye/contracts test && pnpm --filter @mulsigye/contracts typecheck` → Expected: PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add packages/contracts
  git commit -m "feat(contracts): forecast·coach v1 계약 추가"
  ```

---

### Task 4: `/api/v1/forecast` — 시계열 조회·예측·도달일·공식 전망 병기

**Files:**
- Create: `apps/web/src/lib/prediction/forecast-service.ts` (오케스트레이션: resolver로 시군 검증 → `regional_drought_daily` 최근 90일 조회 → 실패 시 커밋 스냅샷 60일(`stale: true`) → 채택 모델로 14일 예측 → 밴드(리포트 잔차 p10/p90; horizon별) → reach/trend → `official_outlooks` 최신 1건(실패 시 스냅샷) 병기. `deps` 주입 패턴은 status-service.ts와 동일)
- Create: `apps/web/src/app/api/v1/forecast/route.ts`
- Test: `apps/web/src/lib/prediction/forecast-service.test.ts`, `apps/web/src/app/api/v1/forecast/route.test.ts`
- Modify: `docs/architecture.md` 필요 시(경로 표는 이미 forecast를 정의 — 변경 없으면 생략)

**Interfaces:** Consumes Task 1·2·3 + 기존 `region-resolver`, `supabase-server`, 스냅샷 JSON, `data/backtest-report.json`(정적 import — 채택 모델명·MAE·분위수). Produces: 계약 일치 `ForecastResponse`.

- [ ] **Step 1: 실패하는 테스트 먼저**
  - Supabase mock 시계열(90일 하강) → 채택 모델 예측 14개·밴드 low<avgRatio<high·`reach.days` 손계산 일치.
  - product.md 데모 수치 정합: avgRatio 68 + d≈-0.45 시계열 → 18일·`within_30d`·targetStage 주의 / 46 + d≈-0.67 → 9일·`within_14d`·targetStage 심각.
  - 정상(상승) → `reach.days null`, `bucket none`, `trend rising`.
  - Supabase 장애 → 스냅샷 60일 폴백 `stale: true` HTTP 200 / 준비 안 된 시군 → 404 / 시계열 자체 없음 → 503 `retryable: true`.
  - **참고 표현 가드**: 응답 JSON 직렬화 문자열에 한국어 문장·금지 단정 표현이 없음(숫자·enum·날짜만).
  - `model.bandMethod`·`version`이 리포트 값과 일치(밴드 산식 메타데이터 — prediction-model.md 요구).

  Run: `pnpm --filter @mulsigye/web test` → Expected: FAIL → 구현 후 PASS
- [ ] **Step 2: 전체 검증 후 Commit**

  Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build`
  ```powershell
  git add apps/web
  git commit -m "feat(web): 14일 예측·도달 가능 시점 forecast API"
  ```

---

### Task 5: 행동 카탈로그 `actions-v1` + CoachPolicy (`packages/llm`)

**Files:**
- Create: `packages/llm/src/action-catalog.ts` (`ACTION_CATALOG_VERSION = "actions-v1"`; 단계 5종 × 3개 + 만수위 `hw_check_drain` 1개 = 16개 `ApprovedAction`. 각 항목 `approvedTitle`(굵은 한 줄용) + `approvedRationale`(보조 설명 한 줄, ~해요체). 카피는 product.md 규칙: 짧은 문장, 심각 단계는 "공식 안내 확인" 위임형, 만수위는 "참고" 톤·홍수 판정 금지)
- Create: `packages/llm/src/coach-policy.ts` (`selectActions(stage, highWaterNotice) → ApprovedAction[3]` — 결정적 순서, hw=true면 `hw_check_drain`을 1순위 + 단계 1·2순위)
- Modify: `packages/llm/src/index.ts` (export 추가)
- Test: `packages/llm/test/action-catalog.test.ts`, `coach-policy.test.ts`
- Modify: `docs/llm-coach.md` (부트스트랩 현재 경계 절 갱신: 카탈로그·정책 포함)

**Interfaces:** Produces: Task 6 프롬프트 입력·Task 7 정적 코치가 쓰는 유일한 행동 출처. StaticCoachProvider는 변경 없이 `facts.actions`를 그대로 소비(기존 계약 유지).

- [ ] **Step 1: 실패하는 테스트 먼저**
  - 카탈로그: 5단계 모두 정확히 3개, ID 중복 없음, 모든 `approvedTitle ≤ 30자`·`approvedRationale ≤ 70자`(GeneratedCoachCopy 스키마와 정합), 전체 카피에 금지 표현("위험합니다","발생합니다","됩니다","내려가요") 0건, 모든 문장이 `요.` 종결(해요체 가드).
  - 정책: 단계 5종 × hw 2종 = 10조합 전부 3개 반환·순서 결정적, hw=true 시 1순위가 `hw_check_drain`.
  - 통합: 10조합 전부 `StaticCoachProvider.generate()`가 validator를 통과하고 행동 ID·순서 보존.

  Run: `pnpm --filter @mulsigye/llm test` → Expected: FAIL → 구현 후 PASS
- [ ] **Step 2: 전체 검증 후 Commit**

  Run: `pnpm --filter @mulsigye/llm lint && pnpm --filter @mulsigye/llm typecheck && pnpm --filter @mulsigye/llm test && pnpm --filter @mulsigye/llm build`
  ```powershell
  git add packages/llm docs/llm-coach.md
  git commit -m "feat(llm): 행동 카탈로그 actions-v1과 CoachPolicy"
  ```

---

### Task 6: AnthropicCoachProvider + 프롬프트 `coach-v1` (미연결, 보호된 계약 테스트)

**Files:**
- Create: `packages/llm/src/coach-prompt.ts` (`PROMPT_VERSION = "coach-v1"`; CoachFactPacket → system+user 메시지 조립. 수치·날짜·지역명 없음 — "우리 지역" 표현, 행동 ID·순서 보존 지시, ~해요체·금지 표현 명시)
- Create: `packages/llm/src/anthropic-coach-provider.ts` (CoachProvider 구현. 생성자에서 `client`(또는 `create` 함수) 주입 가능 — 테스트 mock용. 호출: `client.messages.create({ model: ANTHROPIC_MODEL, max_tokens: LLM_MAX_TOKENS, output_config: { effort: "low", format: { type: "json_schema", schema: GENERATED_COACH_JSON_SCHEMA } }, messages }, { timeout: LLM_TIMEOUT_MS, maxRetries: 0 })`. temperature/top_p/top_k/thinking **미전달**(Opus 4.7 400 거절). 응답에서 `stop_reason === "refusal"`/`"max_tokens"`면 throw, JSON 파싱 후 `validateGeneratedCoachCopy` 통과분만 반환 — 실패는 전부 throw(폴백 결정은 호출자 몫). JSON Schema에는 길이 제약을 넣지 않고(`additionalProperties:false`+`required`만) 길이·의미는 validator가 검증)
- Modify: `packages/llm/src/index.ts`, `packages/llm/src/constants.ts` 필요 시
- Test: `packages/llm/test/anthropic-coach-provider.test.ts` (mock client: 정상 구조화 출력 → 통과, timeout throw, 429/5xx throw, refusal → throw, max_tokens → throw, 행동 ID 재정렬 응답 → `ACTION_IDS_MISMATCH` throw, 금지 표현 응답 → throw, payload에 sigunCode·주소·수치가 없음 단언)
- Create: `packages/llm/test/anthropic-live.contract.test.ts` (`describe.runIf(process.env.LLM_CONTRACT_TEST === "1" && !!process.env.ANTHROPIC_API_KEY)` — 실 claude-opus-4-7 구조화 출력 1개 고정 사례. 기본 CI에서는 skip)
- Modify: `docs/llm-coach.md` (어댑터 존재·미연결 상태·보호 테스트 실행법), `docs/testing-and-feedback.md` (보호된 계약 테스트 명령 추가)

**Interfaces:** Consumes CoachFactPacket/validator/카탈로그. Produces: 향후 live 경로가 쓸 provider. **공개 라우트에 연결하지 않는다**(가드 부재 — packages/llm AGENTS.md).

- [ ] **Step 1: 실패하는 mock 테스트 먼저** — Run: `pnpm --filter @mulsigye/llm test` → Expected: FAIL → 구현 후 PASS
- [ ] **Step 2: (키 보유 시, 선택·수동) 실계약 1회**

  Run(PowerShell): `$env:LLM_CONTRACT_TEST='1'; pnpm --filter @mulsigye/llm test test/anthropic-live.contract.test.ts`

  Expected: 1 pass, 비용 ≈ USD 0.01. 키가 없으면 skip으로 보고하고 실행했다고 쓰지 않는다.
- [ ] **Step 3: 전체 검증 후 Commit**

  Run: `pnpm --filter @mulsigye/llm lint && pnpm --filter @mulsigye/llm typecheck && pnpm --filter @mulsigye/llm test && pnpm --filter @mulsigye/llm build`
  ```powershell
  git add packages/llm docs/llm-coach.md docs/testing-and-feedback.md
  git commit -m "feat(llm): AnthropicCoachProvider와 coach-v1 프롬프트(미연결)"
  ```

---

### Task 7: `/api/v1/coach` — 정적 코치 전용 공개 경로 (LLM 미호출)

**Files:**
- Create: `apps/web/src/lib/coach/coach-context.ts` (CoachContextBuilder: `buildStatus`+`forecast-service` 결과 → `CoachFactPacket` — season(`seasonOf`, deps.now 주입)·reachBucket·trendBucket·highWaterNotice(수위 관측 시계열 → `isHighWaterNotice`)·officialOutlookCode는 이번 단계 `null` 고정. **비식별 단언: 패킷에 sigunCode·지역명·수치 필드 없음**)
- Create: `apps/web/src/lib/coach/coach-service.ts` (facts → `selectActions` → `StaticCoachProvider` → `CoachResponse` 조립: `mode:"static"`, `cacheHit:false`, `fallbackReason:"disabled"`, `dataStale`=status stale, promptVersion/actionCatalogVersion 상수. `LLM_ENABLED` 값과 무관하게 이번 단계는 항상 정적 경로 — env 분기 자체를 두지 않아 실수로 live가 열릴 여지를 없앤다)
- Create: `apps/web/src/app/api/v1/coach/route.ts`
- Test: `apps/web/src/lib/coach/coach-context.test.ts`, `coach-service.test.ts`, `route.test.ts`
- Modify: `docs/llm-coach.md` (공개 경로 = 정적 전용, live 연결 조건 재명시)

**Interfaces:** Consumes Task 1·4·5 + 기존 status-service. Produces: 계약 일치 `CoachResponse`. 클라이언트는 `mode`로 화면 구조를 바꾸지 않는다(설계 spec).

- [ ] **Step 1: 실패하는 테스트 먼저**
  - 5개 공인 단계 각각의 status/forecast mock → 행동 정확히 3개, 카탈로그 title 결합, HTTP 200.
  - `ANTHROPIC_API_KEY` 미설정 + `LLM_ENABLED=false` 환경에서 동작(게이트 문구 그대로).
  - **Anthropic 미호출 단언**: `@anthropic-ai/sdk` 방향 호출 spy 0회(모듈 mock으로 강제).
  - 만수위 mock(rate 96 상승) → `hw_check_drain` 1순위 / 등록 안 된 시군 → 404 / status·forecast 모두 실패 → 503.
  - 응답 카피에 금지 표현 0건, `fallbackReason:"disabled"`·`mode:"static"` 고정.

  Run: `pnpm --filter @mulsigye/web test` → Expected: FAIL → 구현 후 PASS
- [ ] **Step 2: 전체 검증 후 Commit**

  Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build`
  ```powershell
  git add apps/web docs/llm-coach.md
  git commit -m "feat(web): 정적 코치 전용 /api/v1/coach"
  ```

---

### Task 8: 단계 3 완료 게이트 검증·문서 동기화·PR

**Files:**
- Create: `apps/web/test/stage3-gate.test.ts` (게이트 테스트: ① 커밋된 `data/backtest-report.json`이 Zod 스키마 통과 + 채택 모델·mae7·mae14 존재 + prediction-model.md 결과 절 문자열에 같은 수치 포함(문서-리포트 드리프트 가드) ② 5단계 × 대표 3시군 조합에서 coach가 키 없이 행동 3개 반환 ③ forecast 도달일 예제 2개 재검증)
- Modify: `docs/work-plan.md` (단계 3 게이트 통과 근거 기록 — 단계 2와 동일 형식)
- Modify: `docs/testing-and-feedback.md` (게이트 명령 추가), `docs/milestones.md` 해당 시 갱신
- 문서 충돌 감사: `rg -n "가까운 저수지|알림 켜|WebView|지금 속도면" README.md AGENTS.md docs prototype`

**Steps:**
- [ ] **Step 1: 게이트 테스트 작성·통과** — Run: `pnpm --filter @mulsigye/web test test/stage3-gate.test.ts` → Expected: PASS
- [ ] **Step 2: MAE 재현 확인(게이트 조건)** — Run: `pnpm backtest` 재실행 → `data/backtest-report.json`의 지표 값이 커밋본과 동일(diff에서 runAt/gitCommit만 변경 — 변경분은 되돌리고 커밋하지 않음: `git checkout -- data/backtest-report.json`)
- [ ] **Step 3: 전체 루트 검증** — Run: `pnpm harness:check && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:lint` → Expected: 모두 PASS
- [ ] **Step 4: Commit, push, PR**
  ```powershell
  git add apps/web docs
  git commit -m "feat: 단계 3 완료 게이트 검증과 문서 동기화"
  git push -u origin feat/stage3-prediction-coach
  gh pr create --base main --title "feat: 예측·백테스트·코치 폴백 (단계 3)" --body "..."
  ```
  PR 본문에 conventions 체크리스트 + 아래 열린 질문 명시.

---

## 열린 질문 (플랜 실행 전 확정)

1. **live `/api/v1/coach` 연결 시점** — 이번 플랜은 설계 spec("캐시·예산 가드 없는 공개 경로 금지")에 따라 정적 전용으로 노출. 캐시·lock·예산 가드 구현 + `LLM_ENABLED=true` 전환을 단계 4 마지막 Task로 할지, 제출 직전 별도 브랜치로 할지. (권장: 단계 4 마지막 Task)
2. **실 Anthropic 계약 테스트(Task 6 Step 2)** — ANTHROPIC_API_KEY 보유 확인됨. 1회 실행 비용 ≈ USD 0.01.
3. **`forecast_runs` 테이블** — 이번 설계는 요청 시 계산으로 충분해 만들지 않음. architecture.md 해당 행을 "v1 범위 밖(요청 시 계산)"으로 같은 PR에서 수정. (권장: 만들지 않음)
4. **백테스트 결과 JSON 경로** — SSOT인 prediction-model.md의 `data/backtest-report.json`을 따름.
5. **신규 상수 값 승인** — `LINEAR_WINDOW_DAYS=14`, `SES_ALPHA=0.3`, `TREND_STABLE_EPSILON=0.05`, `MAX_GAP_DAYS=7`, 단순성 서열 `naive<ma7<ses<linear`.
6. **`officialOutlookCode` 카탈로그** — 이번 단계 `null` 고정. 승인 전망 코드 카탈로그는 live 연결 결정(1번)과 함께 확정.
