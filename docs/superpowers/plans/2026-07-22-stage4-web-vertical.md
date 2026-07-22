# Mulsigye 단계 4 — 웹 세로 기능 조각 + live 코치 연결 구현 플랜

> **For agentic workers:** superpowers:subagent-driven-development 또는 superpowers:executing-plans로 Task 단위 실행. 체크박스(`- [ ]`)로 진행을 추적한다.

- 상태: 사용자 승인 (2026-07-22)
- 작성일: 2026-07-22
- 확정 결정: 4개 상태 시연 = 계약 픽스처 자동 테스트 + 실데이터 정상/심각/stale 수동 시연 / 예산 가드 = 앱 레벨 2단계 + lock / live 활성화 = Task 9 머지 직후 Vercel env 설정 / localStorage = 코드만 저장 / 폴리시 문안 = 초안 후 제출 전 사람 검토
- 근거 SSOT: `AGENTS.md` 절대 규칙 3·6·7·10, `docs/work-plan.md` 단계 4 구현 순서·완료 게이트, `docs/product.md`(화면·카피), `docs/design-system.md`(토큰·컴포넌트·애니메이션·접근성), `docs/llm-coach.md` + `docs/superpowers/specs/2026-07-19-llm-coach-design.md` 4~14절(캐시 키·lock·예산·비식별), `docs/testing-and-feedback.md`(검증 명령·QA), `docs/architecture.md`(모듈 경계·localStorage 원칙)
- 브랜치 전략: Task 1~8은 `feat/stage4-web-vertical`에서 태스크별 커밋 → `main` PR. **Task 9(live 코치)는 별도 브랜치 `feat/llm-live-coach`·별도 PR** — packages/llm AGENTS.md의 "캐시·lock·예산 가드가 자동 테스트되는 **별도 변경**에서만 연결" 요건을 브랜치 단위로 충족한다.

**Goal:** 웹에서 온보딩 → 동의 → 지역 등록(주소 검색 → 대표 저수지 확인 → 등록) → 메인(게이지·공식 단계·도달일·코치 행동 3개·만수위 참고 배너) → 평년 대비 흐름 상세(실측 30일 실선 + 예측 14일 점선 + 밴드 SVG) → 폴리시까지 P0 플로우를 실제 `/api/v1/*`로 완성한다. 지역·동의는 localStorage(코드·버전만)에 저장하고 서버에 저장하지 않는다. 완료 게이트: 4개 상태(정상·가뭄 진행·심각 임박·장마 만수위)와 지연 폴백(stale)이 계약 정합 픽스처 기반 stage4-gate 테스트로 자동 검증되고, 375px·큰 글꼴 200%·키보드·reduced motion QA를 통과한다. 마지막으로 `/api/v1/coach`에 LLM_ENABLED 분기 + Supabase coach_cache/coach_generation_locks/llm_usage + 일일 20회·USD 5 가드 + AnthropicCoachProvider를 연결하되, 모든 실패 경로에서 정적 코치 HTTP 200을 유지한다.

**Architecture:**

```text
라우트 (App Router, 전부 클라이언트 데이터 페치 — /api/v1/*만 호출)
  /            메인 (지역 없으면 /onboarding으로; 최초 방문 스플래시 오버레이 1.5s)
  /onboarding  3장 캐러셀 + CTA "내 지역 설정하기"
  /regions     등록 지역 리스트(선택·삭제·빈 상태) + 최초 1회 동의 바텀시트
  /regions/add 주소 검색 → 시군구 확정 → 대표 저수지 확인 → 등록
  /trend       평년 대비 흐름 상세 (큰 차트 + 단계 기준 + 예측 방법 + 공식 전망)
  /policy/location, /policy/terms, /policy/privacy   폴리시(약관·개인정보·면책)

클라이언트 계층 (신규)
  src/lib/client/region-store.ts   localStorage "mulsigye:v1"
      { schemaVersion:1, consentVersion:string|null, regions:[{sigunCode,facCode}], currentIndex }
      — 지역 코드·대표 시설 코드·동의 버전**만** 저장(architecture.md). 이름·주소 미저장.
  src/lib/client/api-client.ts     계약 타입 기반 fetch 래퍼 + {code,message,retryable} 오류 매핑
  src/components/ui/*              Card·StageChip·CtaButton·Skeleton·BottomSheet (CSS Modules + 전역 토큰)
  src/components/*                 MainHeader·ReservoirGauge·ReachCard·TrendChart·CoachCard·SourcesCard·HighWaterBanner·RegionList·AddressSearch

서버 확장 (v1 호환 추가만)
  StatusResponse += highWaterNotice:boolean  — 만수위 참고 판정은 서버가 확정(자체 판정의 클라이언트 복제 금지).
      status-service가 기존 수위 관측 시계열로 isHighWaterNotice 계산, coach-service의 중복 rateSeriesFor 제거.

live 코치 (Task 9, 별도 PR) — 설계 spec 6.1 순서 그대로
  coach-service: 정적 조립(기존) → LLM_ENABLED && 키 존재 시에만 live 파이프라인
  src/lib/coach/coach-cache.ts   spec 9절 cache key(SHA-256, sigunCode·수치·시각 제외) + 30일 TTL 조회/저장
  src/lib/coach/coach-guards.ts  KST 일일 live miss 한도·누적 USD 예산(건당 0.02 선예약)·generation lock claim
  실패 전 경로 → 기존 정적 코치 200 + fallbackReason (계약 enum 그대로)
```

**Tech Stack:** 새 의존성 0. 차트는 인라인 SVG 직접 구현(tech-stack 금지 조항), 스타일은 CSS Modules + `globals.css` 토큰(디자인 시스템 전체 토큰으로 확장), 테스트는 기존 vitest 4.1.10 + jsdom + @testing-library/react 16.3.2 + jest-dom. cache key 해시는 `node:crypto` SHA-256. Anthropic 스텁은 기존 `apps/web/test/anthropic-sdk-stub.ts` 호출 카운터를 재사용한다.

## 사전 판단 요약

1. **데모 시나리오:** 실데이터 최신 단계 분포가 정상 153 · 심각 1(제주시 50110)뿐이라 "대표 3시군이 실데이터로 다른 단계"는 성립하지 않는다. 프로토타입의 시나리오 버튼은 실서비스 UI에 넣지 않고, 4개 상태 시연은 **product.md 상태 표와 산술 정합인 계약 픽스처 4벌**을 `packages/contracts/examples`에 추가해 stage4-gate 테스트(실제 화면 컴포넌트 + 계약 검증된 응답)로 자동 시연한다. 실배포 수동 시연은 정상(대표 3시군)·심각(제주시 50110)·stale(수위 API 폴백)로 한다.
2. **만수위 배너:** 판정 로직(95%+상승)은 서버에만 있는데 status 계약에 노출 필드가 없다 → `highWaterNotice`를 StatusResponse에 v1 호환 추가(Task 3). 클라이언트 자체 판정은 금지 원칙 위반이라 배제.
3. **live 코치:** 이번에 연결하는 것은 spec 6.1 공개 런타임 전체(분기·캐시·lock·한도·예산·usage·폴백)이고, 6.2 사전 생성(seed)·평가 리포트 자동화·전망 코드 카탈로그는 제외.

## Global Constraints

- **참고 표현만(규칙 3).** 모든 예측 문구는 "지금 추세가 이어지면 N일 뒤 '단계'에 들어설 가능성이 있어요" 형식 + 모든 예측 화면에 "예측은 참고용이며 공식 가뭄 예·경보가 우선이에요" 병기. "내려가요/됩니다/위험합니다/발생합니다" 금지 — UI 카피 테스트로 강제.
- **~해요체·고령 농업인(규칙 6).** 본문 15px 이상, 핵심 숫자 3rem급, 짧은 문장. "가까운 저수지"·거리·알림 CTA·로그인 CTA 금지(design-system 콘텐츠 가드).
- **두 저수율 분리.** 게이지 = 대표 저수지 원저수율 `rate`(제목 "우리 지역 대표 저수지", 값 라벨 "현재 저수율"), 단계 칩·차트 = `avgRatio`(보조 라벨 "지역 평년 대비 기준"). 게이지에 단계 눈금을 겹치지 않는다.
- **단계 기준 단일 출처(규칙 5).** 70/60/50/40과 code↔label은 `apps/web/src/lib/data/drought-stage.ts`에서만 import. UI에 임계값 복제 금지.
- **개인정보.** 주소 원문·검색어는 응답 후 폐기, localStorage에는 코드·동의 버전만. live 코치 payload·로그에 sigunCode·지역명·수치·주소 금지(캐시 키 규칙 동일) — 테스트로 강제.
- **LLM 경계(규칙 10).** Task 8까지의 어떤 커밋에서도 공개 경로가 Anthropic을 호출하지 않는다(anthropic-sdk-stub 카운터 0 단언 유지). Task 9 이후에도 단계·수치·행동 ID·순서는 서버 확정, 실패 시 정적 200.
- **클라이언트는 mode·stale로 화면 구조를 바꾸지 않는다.** stale은 지연 안내 문구만 추가, coach mode는 표시 차이 없음.
- **접근성.** 터치 목표 48px, `:focus-visible`, heading 순서, 아이콘 버튼 접근 가능한 이름, `prefers-reduced-motion`에서 장식 모션(물 출렁임·rainfall·카운트업·화면 전환) 정지.
- **문서 동기화(규칙 7).** 각 Task의 코드와 문서·프로토타입 갱신을 같은 커밋에 담는다.
- **로딩 패턴 고정.** 메인 = 모듈별 스켈레톤(shimmer 1.3s, 풀스크린 스피너 금지), 주소 검색 = 인라인 스피너, 등록·삭제 버튼 = 내부 스피너 + 중복 입력 잠금, 기준 시각 = "불러오는 중…".

---

### Task 1: 전역 토큰·UI 프리미티브·지역/동의 저장소·API 클라이언트

**Files:**
- Modify: `apps/web/src/app/globals.css` — design-system.md 토큰 전체(`--ink~--ink4`, `--gray50/100/200`, `--blue*`, 5단계 fg/bg, `--r-lg/md/sm`)로 확장, 기존 축약 토큰과 이름 통일. shimmer keyframes·`:focus-visible` 규칙 추가(기존 reduced-motion 블록 유지).
- Create: `apps/web/src/components/ui/Card.tsx` + `.module.css` (gray50·radius 24·패딩 20, 모듈 간격 24px는 페이지 레이아웃 소유)
- Create: `apps/web/src/components/ui/StageChip.tsx` (5단계 tint + 보조 라벨 "지역 평년 대비 기준" — drought-stage code 기반)
- Create: `apps/web/src/components/ui/CtaButton.tsx` (56px·radius 16·busy 잠금 상태 포함)
- Create: `apps/web/src/components/ui/Skeleton.tsx`, `apps/web/src/components/ui/BottomSheet.tsx` (상단 radius 24·그랩바·dim `rgba(25,31,40,.45)`·포커스 트랩·Esc 닫기)
- Create: `apps/web/src/lib/client/region-store.ts` — 키 `mulsigye:v1`, `{ schemaVersion, consentVersion, regions:[{sigunCode,facCode}], currentIndex }`, load/save/addRegion/removeRegion/selectRegion/setConsent, 알 수 없는 schemaVersion·손상 JSON → 안전 초기화(버전 마이그레이션 훅 포함)
- Create: `apps/web/src/lib/client/api-client.ts` — `getStatus/getForecast/getCoach/searchRegions/resolveRegion` 타입드 fetch, 비 2xx → `ApiError` 파싱 → `{ kind:"error", retryable }`, 네트워크 예외 → retryable true
- Test: `region-store.test.ts`(저장·선택·삭제·마이그레이션·**주소 원문이 어떤 키에도 저장되지 않음**), `api-client.test.ts`(정상·400/404/503 매핑·네트워크 오류), `StageChip.test.tsx`(5단계 라벨·보조 라벨), `CtaButton.test.tsx`(busy 시 클릭 무시)
- Modify: `docs/architecture.md` 폴더 구조에 `src/lib/client/`·`src/components/ui/` 한 줄 추가

- [ ] **Step 1: 실패하는 테스트 먼저** — Run: `pnpm --filter @mulsigye/web test src/lib/client src/components/ui` → FAIL(모듈 없음)
- [ ] **Step 2: 구현 후 검증** — Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm format:check` → PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add apps/web/src docs/architecture.md
  git commit -m "feat(web): 디자인 토큰 전체와 UI 프리미티브·지역 저장소·API 클라이언트"
  ```

---

### Task 2: 지역 설정·주소 검색·대표 저수지 등록 플로우 (`/regions`, `/regions/add`)

**Files:**
- Create: `apps/web/src/app/regions/page.tsx` + `.module.css` — 등록 지역 리스트(선택·삭제 버튼 `aria-label="{지역} 삭제"`·빈 상태 "아직 등록한 지역이 없어요"), 하단 "물시계 시작하기" CTA(지역 있을 때만). 지역 이름·저수지명은 코드로 `/api/v1/status`를 병렬 호출해 표시(저장소에는 코드만).
- Create: `apps/web/src/app/regions/add/page.tsx` + `.module.css` — 검색 입력(300ms 디바운스) → `GET /regions/search` 후보 리스트(인라인 스피너·빈 결과 카피) → 후보 선택 시 `POST /regions/resolve` → 확인 카드("이 주소로 등록할까요?" + "우리 지역 대표 저수지 · {name}") → `prepared:false`면 "이 지역은 아직 준비 중이에요" + 등록 비활성 → 등록 버튼(내부 스피너·중복 잠금) → 저장소 추가 후 `/regions` 복귀. **주소 원문은 등록 후 어떤 저장소에도 남기지 않는다.**
- Create: `apps/web/src/components/RegionList.tsx`, `apps/web/src/components/AddressSearch.tsx`
- Test: `AddressSearch.test.tsx` — fetch 스텁(기존 계약 examples 재사용): 해피패스, not-ready 처리, 503 재시도 버튼, 등록 후 localStorage에 코드 2개만 존재. `RegionList.test.tsx` — 빈 상태·선택 전환·삭제·현재 지역 삭제 시 currentIndex 보정.

- [ ] **Step 1: 실패하는 테스트 먼저** → FAIL
- [ ] **Step 2: 구현 후 검증** — Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build` → PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add apps/web/src
  git commit -m "feat(web): 지역 검색·대표 저수지 확인·등록 플로우"
  ```

---

### Task 3: 계약 확장 — StatusResponse.highWaterNotice + 4개 상태 데모 픽스처

**Files:**
- Modify: `packages/contracts/openapi.yaml` — `StatusResponse`에 required `highWaterNotice: boolean` 추가(설명: 서버 확정, 클라이언트 재판정 금지), 기존 예시 갱신.
- Regenerate: `packages/contracts/src/generated/openapi.ts`
- Create: `packages/contracts/examples/status.normal-demo.json`(84/103/정상/false), `status.watch-demo.json`(57/68/관심/false), `status.severe-demo.json`(33/46/경계/false), `status.flood-demo.json`(96/118/정상/**true**), `forecast.watch-demo.json`(−0.45→18일·주의), `forecast.severe-demo.json`(−0.67→9일·심각), `forecast.normal-demo.json`(−0.12→none), `forecast.flood-demo.json`(+0.42→none) — history 30점·forecast 14점·밴드 포함, **product.md 상태 표와 산술 정합**.
- Modify: `packages/contracts/test/status-contract.test.ts`, `forecast-contract.test.ts` — 새 예시 스키마 검증 + 도달일·단계 산술 정합 테스트.
- Modify: `apps/web/src/lib/data/status-service.ts` — 관측 폴백 3단 각각에서 rate 시계열로 `isHighWaterNotice` 계산해 포함(시계열 미확보 시 false).
- Modify: `apps/web/src/lib/coach/coach-service.ts` — `rateSeriesFor` 제거, `status.highWaterNotice` 사용.
- Test: status-service notice 케이스 추가, coach-service 만수위 경로 수정(스텁 0회 단언 유지).
- Modify: `docs/architecture.md` API 책임 표, `docs/llm-coach.md` 만수위 판정 절.

- [ ] **Step 1: 실패하는 테스트 먼저** → FAIL
- [ ] **Step 2: 구현 후 검증** — Run: `pnpm openapi:lint && pnpm --filter @mulsigye/contracts test && pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test` → PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add packages/contracts apps/web/src docs
  git commit -m "feat(contracts): status에 만수위 참고 필드와 4개 상태 데모 픽스처 추가"
  ```

---

### Task 4: 메인 화면 — 상태 모듈(게이지·단계·만수위 배너·스켈레톤·stale·오류)

**Files:**
- Rewrite: `apps/web/src/app/page.tsx` + `page.module.css` — 메인 셸: MainHeader(로고 탭=새로고침 rainfall 0.62s·현재 지역 라벨 + [>] → `/regions`), 기준 시각 스탬프(asOf → "오늘 오후 h:mm 기준", 로딩 중 "불러오는 중…", stale이면 "{observedOn} 기준 · 지연된 정보예요"), 모듈 간격 24px, 모듈별 스켈레톤. 지역 미등록이면 `/onboarding` replace.
- Create: `apps/web/src/components/TodayCard.tsx` — 제목 "우리 지역 대표 저수지", 값 라벨 "현재 저수율", rate 카운트업(0.6s·reduced-motion 시 즉시), `지역 평년 대비 {avgRatio}%` + StageChip, 단계별 검토 완료 헤드라인 상수, rate null 시 "관측값을 불러오지 못했어요".
- Create: `apps/web/src/components/ReservoirGauge.tsx` + `.module.css` — 물 출렁임 타원 2겹(7s/11s reverse)·수위 0→목표 1.6s·reduced-motion 시 정지, `aria-hidden`.
- Create: `apps/web/src/components/HighWaterBanner.tsx` — `highWaterNotice===true`일 때만 파란 "참고" 배너.
- Delete: `apps/web/src/components/HealthCard.tsx` + css + 테스트 (health 라우트는 유지)
- Test: `TodayCard.test.tsx`(4개 상태 픽스처·rate null·금지 표현 부재), `HighWaterBanner.test.tsx`(flood만 표시·경보 단어 부재), `page.test.tsx`(스켈레톤→데이터, stale 문구, 503 재시도, 게이팅, 로고 새로고침)

- [ ] **Step 1: 실패하는 테스트 먼저** → FAIL
- [ ] **Step 2: 구현 후 검증** — Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build` → PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add apps/web/src
  git commit -m "feat(web): 메인 상태 모듈 — 게이지·단계 칩·만수위 참고 배너·스켈레톤"
  ```

---

### Task 5: 흐름 차트 SVG 컴포넌트 + '이 추세라면'·'저수율 흐름' 모듈

**Files:**
- Create: `apps/web/src/components/TrendChart.tsx` — 순수 프리젠테이션. 실측 30일 실선 + 예측 14일 점선 + **밴드는 API low/high 폴리곤**(임의 산식 금지) + 임계선(drought-stage import, 범위 근처만) + '오늘' 수직선·기준점 + y축 라벨. `role="img"` + aria-label + visually-hidden 요약.
- Create: `apps/web/src/components/ReachCard.tsx` — "이 추세라면": days 있으면 "N일 뒤" + "'{단계}' 단계에 들어설 가능성이 있어요", 없으면 "안정". 보조 캡션 "예측 오차(백테스트): 7일 ±{mae7}%p · 14일 ±{mae14}%p 수준이에요"(model 메타 — 하드코딩 금지).
- Create: `apps/web/src/components/TrendChartCard.tsx` — 메인용 카드 + "자세히" → `/trend`.
- Modify: `apps/web/src/app/page.tsx` — forecast 병렬 페치, 예측 모듈 하단 "예측은 참고용이며 공식 가뭄 예·경보가 우선이에요."
- Test: `TrendChart.test.tsx`(경로 2개·밴드 low/high 좌표·임계선 필터·aria·NaN 없음·결정성), `ReachCard.test.tsx`(18일·9일·안정 카피 정합·금지 표현 부재·MAE 캡션 model 값)

- [ ] **Step 1: 실패하는 테스트 먼저** → FAIL
- [ ] **Step 2: 구현 후 검증** — Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build` → PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add apps/web/src
  git commit -m "feat(web): 평년 대비 흐름 SVG 차트와 도달 예상 모듈"
  ```

---

### Task 6: 물시계 코치 카드·근거 고지 모듈 + 프로토타입 동기화

**Files:**
- Create: `apps/web/src/components/CoachCard.tsx` — "물시계 코치" 헤더 + headline·summary + 행동 3개(번호·제목·보조 설명). mode·fallbackReason에 따른 구조 차이 없음. coach 503 시 모듈만 오류 카드. 채팅 암시 UI 금지.
- Create: `apps/web/src/components/SourcesCard.tsx` — "이 화면의 근거": 공인 기준 설명 + 공식 우선 + `sources` 칩 + stale 지연 안내.
- Modify: `apps/web/src/app/page.tsx` — coach 페치(비차단) + 모듈 삽입.
- Modify: `prototype/mulsigye-app-prototype-v2.html` — "코치에게 물어보기" 버튼 제거, 백테스트 오차 실값 형식 갱신(pred-v1 수치).
- Test: `CoachCard.test.tsx`(행동 3개·mode 3값 DOM 동일·503 폴백), `SourcesCard.test.tsx`
- Run: `node scripts/check-prototype.mjs` 통과 확인

- [ ] **Step 1: 실패하는 테스트 먼저** → FAIL
- [ ] **Step 2: 구현·프로토타입 갱신 후 검증** — Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && node scripts/check-prototype.mjs && pnpm format:check` → PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add apps/web/src prototype
  git commit -m "feat(web): 물시계 코치 카드·근거 고지 모듈, 프로토타입 채팅 암시 제거"
  ```

---

### Task 7: 온보딩·동의 바텀시트·스플래시·폴리시·진입 게이팅

**Files:**
- Create: `apps/web/src/app/onboarding/page.tsx` + `.module.css` — 3장 캐러셀(스크롤 스냅·점 표시), CTA "내 지역 설정하기" + "가입 없이 바로 시작해요" → `/regions`.
- Create: `apps/web/src/components/ConsentSheet.tsx` — BottomSheet: "모두 동의합니다" + 필수 2건(위치기반·이용약관, 각 `/policy/*` 링크), 필수 완료 시에만 활성, 완료 시 `consentVersion="consent-v1"` 저장. `/regions` 최초 진입 시 자동 오픈, 동의 전 dim 닫기 불가.
- Create: `apps/web/src/components/Splash.tsx` — `/` 최초 진입 1.5s 오버레이, reduced-motion 시 즉시 통과.
- Create: `apps/web/src/app/policy/location/page.tsx`, `policy/terms/page.tsx`, `policy/privacy/page.tsx` — ~해요체 초안(주소 미저장·기기 저장·예측 참고 면책·LLM 비식별). 법적 최종 문안은 제출 전 사람 검토.
- Modify: `apps/web/src/app/page.tsx` — 게이팅: consent 없음→`/onboarding`, 지역 없음→`/regions`.
- Modify: `docs/product.md` — 폴리시 화면 3종·동의 항목·게이팅 규칙 한 절 추가.
- Test: `ConsentSheet.test.tsx`, `onboarding.test.tsx`, 게이팅 테스트, 폴리시 페이지 로그인·알림 문구 부재.

- [ ] **Step 1: 실패하는 테스트 먼저** → FAIL
- [ ] **Step 2: 구현 후 검증** — Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build` → PASS
- [ ] **Step 3: Commit**
  ```powershell
  git add apps/web/src docs/product.md
  git commit -m "feat(web): 온보딩·동의 바텀시트·스플래시·폴리시 화면"
  ```

---

### Task 8: 흐름 상세 화면 + stage4-gate 통합 테스트 + 접근성 QA + 게이트 기록

**Files:**
- Create: `apps/web/src/app/trend/page.tsx` + `.module.css` — 헤더(뒤로), TrendChart(300) + 범례, "가뭄 단계 기준" 표(drought-stage 기반), "예측은 이렇게 계산해요"(model.mae7/mae14 실값 + 공식 우선 고지), officialOutlook 병기.
- Create: `apps/web/test/stage4-gate.test.ts` — 완료 게이트 자동화(데모 픽스처 4벌 fetch 스텁): ① 4개 상태 메인 전체 렌더 정합 ② stale 지연 표시 ③ 카피 감사(금지 표현·가까운 저수지·알림·로그인 0건, 공식 우선 고지 존재) ④ 접근성 자동화분(heading 순서·버튼 이름·차트 aria·키보드·reduced-motion 분기).
- Modify: `docs/testing-and-feedback.md` — 게이트 명령 추가, 수동 QA 기록 위치.
- Modify: `docs/work-plan.md` — 단계 4 게이트 통과 기록(수동 QA 완료 후).
- 수동 QA(PR 전): 375px·200% 확대·키보드·OS reduced motion, Vercel 프리뷰 실 API 확인(정상/심각/stale), 디자이너 공유.

- [ ] **Step 1: 실패하는 게이트 테스트 먼저** → FAIL
- [ ] **Step 2: 상세 화면 구현 후 전체 검증** — Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @mulsigye/web build && pnpm format:check` → PASS
- [ ] **Step 3: 수동 QA 수행·기록 후 Commit + PR**
  ```powershell
  git add apps/web docs
  git commit -m "feat(web): 흐름 상세 화면과 단계 4 완료 게이트 테스트"
  ```

---

### Task 9: live 코치 연결 — LLM_ENABLED 분기·coach_cache·lock·llm_usage·예산 가드 (별도 브랜치·별도 PR)

**Files:** (브랜치 `feat/llm-live-coach`, Task 8 머지 후)
- Create: `apps/web/src/lib/coach/coach-cache.ts` — `buildCacheKey(facts, orderedActionIds)`: spec 9절 필드 정규화 연결 후 SHA-256 hex. **sigunCode·지역명·수치·요청 시각 미포함(테스트 강제)**. `getCachedCoach`(expires_at·`validation_status='valid'`만), `putCachedCoach`(TTL 30일).
- Create: `apps/web/src/lib/coach/coach-guards.ts` — `checkDailyLiveMissLimit`(KST 달력일, llm_usage count ≥ 20 차단), `reserveBudget`(건당 0.02 선예약, 합계 > USD 5 차단·예약 회수), `settleUsage`, `claimGenerationLock`(insert → 만료 인수, TTL 15s), `releaseGenerationLock`.
- Modify: `apps/web/src/lib/coach/coach-service.ts` — live 파이프라인(spec 6.1 순서): env 분기 → 캐시 조회(hit → mode "cache") → 일일 한도 → 예산 예약 → lock → provider 1회 → 검증 통과분 캐시 저장 → mode "llm". Supabase 오류 어느 단계든 Claude 미호출·정적 200. provider 예외 → fallbackReason 매핑. 로그는 비식별 메타만. deps.llm 주입.
- Test: `coach-cache.test.ts`, `coach-guards.test.ts`, `coach-service.test.ts` 확장 — llm-coach.md 검증 게이트 전부(비활성/키 없음/캐시 히트/동시 miss ≤1회/Supabase 장애/타임아웃·429·refusal·검증 실패/한도·예산 초과 → 각 폴백 200 + Anthropic 호출 횟수 스텁 단언).
- Modify: `docs/llm-coach.md`(live 상태 재작성), `docs/testing-and-feedback.md`, `docs/work-plan.md`.
- 사람 작업: Vercel Production `LLM_ENABLED=true`·`ANTHROPIC_API_KEY` 설정(Preview 미주입), 배포 후 실 miss 1회 확인.

- [ ] **Step 1: 실패하는 테스트 먼저** — Run: `pnpm --filter @mulsigye/web test src/lib/coach` → FAIL
- [ ] **Step 2: 구현 후 검증** — Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/llm test && pnpm --filter @mulsigye/web build && pnpm format:check` → PASS
- [ ] **Step 3: Commit + PR**
  ```powershell
  git add apps/web/src docs
  git commit -m "feat(web): 코치 live 연결 — coach_cache·lock·예산 가드와 정적 폴백"
  ```

---

## 프로토타입 충돌점 처리 (요약)

| 프로토타입 | 처리 |
|---|---|
| "코치에게 물어보기" 버튼 | 구현 금지, Task 6에서 프로토타입 제거 |
| 예측 오차 플레이스홀더 | API model 메타 표시, 프로토타입 갱신 |
| 밴드 임의 산식 | API low/high만 사용(테스트 강제) |
| 동 단위 라벨 저장 | 코드만 저장, 표시는 응답 값 |
| 만수위 데모 플래그 | 서버 `highWaterNotice` 필드 신설 |
| 데브바 시나리오 버튼 | 실서비스 미탑재, 게이트는 픽스처 테스트 |
| 스탬프 항상 현재 시각 | stale 시 관측 기준일+지연 문구 |

## 확정 대기 열린 질문

1. 4개 상태 시연 방식: (a) 픽스처 자동 테스트 + 실데이터 정상/심각/stale 수동 시연 (기본안) vs (b) 서버 가드 데모 파라미터.
2. localStorage 표시 캐시: 코드만 저장(기본안).
3. 예산 예약 원자성: 앱 레벨 2단계 + lock (최악 초과 ≈ USD 0.04, 기본안) vs RPC 마이그레이션.
4. 폴리시 3종 법적 문안: 초안 작성 후 제출 전 사람 검토.
5. Vercel env 전환 시점: Task 9 머지 직후 vs 발표 리허설 시점.
6. 제주시(50110) 심각 시연: 수위 관측 가용성 사전 확인, 불가 시 픽스처 시연 대체.
