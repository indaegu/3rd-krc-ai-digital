# Mulsigye 단계 5 — Android 세로 기능 조각 구현 플랜

> **For agentic workers:** superpowers:subagent-driven-development 또는 superpowers:executing-plans로 Task 단위 실행. 체크박스(`- [ ]`)로 진행을 추적한다. **실기기 필요 항목은 "사람 작업" Task로 분리했다.**

- 상태: 사용자 승인 (2026-07-23)
- 확정 결정: 네비게이션=상태 기반(라이브러리 없음) / release signingConfig=Task 1에서 스캐폴드(keystore.properties 있으면 서명·없으면 debug 폴백, 비밀값 0) / health 화면 제거(/api/v1/health 라우트는 유지) / release base URL=`https://3rd-krc-ai-digital-web.vercel.app/` / 4상태=계약 픽스처 Robolectric 게이트 + 실 API 정상/심각/stale 수동 / LLM_ENABLED=false 정적 코치 데모 / 폴리시 문안 초안 후 제출 전 사람 검토
- 근거 SSOT: `AGENTS.md` 절대 규칙 3·5·6·7·10, `docs/work-plan.md` 단계 5 구현 순서·완료 게이트, `docs/product.md`(화면·카피·상태 4종), `docs/design-system.md`(토큰·컴포넌트·애니메이션·접근성), `docs/tech-stack.md`(Android 스택·금지 라이브러리·버전 고정), `docs/architecture.md`(웹↔Android 브릿지·DataStore 경계), `packages/contracts/openapi.yaml`(소비 계약), `docs/testing-and-feedback.md`(Android 검증 명령·QA), `apps/web/src/**`(웹이 구현한 동일 순서 플로우 — 로직 복제 아님, 표시 순서 참고)
- 브랜치 전략: `feat/stage5-android-vertical`에서 Task별 커밋 → `main` PR. 사람 작업 Task 9(서명 release·실기기 QA)는 PR 머지 후 사람이 별도 수행하고 `docs/work-plan.md` 단계 5 게이트에 기록한다.

**Goal:** 기존 Android health 조각(Retrofit + Repository + Compose)을 확장해 **웹과 동일한 API 순서**(regions/search → regions/resolve → status → forecast → coach)로 온보딩 → 동의 → 지역 등록(주소 검색 → 대표 저수지 확인 → 등록) → 메인(게이지·공식 단계·도달일·코치 행동 3개·만수위 참고 배너) → 평년 대비 흐름 상세 → 폴리시 P0 플로우를 Compose 네이티브로 완성한다. **단계 판정·예측·도달일·코치 문구·만수위 판정은 전부 서버가 준 값을 표시**하고 복제하지 않는다(work-plan 규칙). 지역·동의는 DataStore(코드 2종 + 동의 버전만) 저장. 자동 검증분(유닛 테스트·Robolectric Compose 테스트·lintDebug·assembleDebug)은 서브에이전트/CI가 통과시키고, 서명 release APK 실기기 설치·큰 글꼴·뒤로가기·TalkBack·오프라인 폴백은 사람이 수행한다.

---

## Architecture

```text
단일 Activity + 상태 기반 라우터 (Navigation 라이브러리 없음 — tech-stack 금지 목록 준수)
  MainActivity → MulsigyeApp(container)
    AppRouter: sealed interface Screen { Splash, Onboarding, Regions, RegionAdd, Main, Trend, Policy(kind) }
      rememberSaveable 백스택 + BackHandler(하드웨어/제스처 뒤로가기)
      게이팅: consentVersion 없음 → Onboarding, 동의 있고 지역 없음 → Regions,
              둘 다 있으면 Splash(1.5s·reduced-motion 즉시) → Main

core (플랫폼 공통 프리미티브 — 신규)
  core/designsystem/theme/Color.kt   design-system 토큰 전체(ink1~4·gray50/100/200·blue*·5단계 fg/bg·radii)
  core/designsystem/theme/StageColors.kt  ok/watch/care/alert/crit fg·bg (의미·값 고정)
  core/designsystem/component/       MulsigyeCard·StageChip·CtaButton·Shimmer(Skeleton)·MulsigyeBottomSheet
  core/ui/ReducedMotion.kt           rememberReducedMotion() = Settings.Global ANIMATOR_DURATION_SCALE==0
  core/network/ApiClient·ApiErrorDto (기존 재사용)
  core/storage/RegionStore.kt        DataStore(Preferences) — 코드 2종 + 동의 버전만, 마이그레이션 훅

feature/<region|status|forecast|coach> (health 패턴 확장)
  data/remote/<X>Api.kt              Retrofit 인터페이스 (/api/v1/*)
  data/remote/<X>ResponseDto.kt      @Serializable DTO — openapi.yaml과 1:1 (단계 6 교차검증 대상)
  data/Default<X>Repository.kt       DTO→도메인 매핑·3단 폴백/오류 매핑(health 패턴)
  domain/<X>Result.kt, <X>Repository.kt
  presentation/<X>ViewModel.kt + <화면 컴포저블>

화면 컴포저블 (전부 순수: 상태 + 콜백만 받음 → Robolectric 단위 렌더 가능, 웹 컴포넌트 분리 방식과 동일)
  OnboardingScreen(HorizontalPager) · ConsentSheet(ModalBottomSheet·필수·딤 닫기 불가)
  RegionListScreen · RegionAddScreen(AddressSearch) · PolicyScreen(3종)
  MainScreen: MainHeader(로고 탭=새로고침)·기준시각 스탬프·TodayCard(게이지 Canvas)·
              HighWaterBanner·ReachCard·TrendChartCard·CoachCard·SourcesCard·면책 문구
  TrendScreen: 큰 흐름 차트(Canvas)·단계 기준표·예측 방법·officialOutlook

base URL: BuildConfig.API_BASE_URL (기존 주입 구조 유지)
  debug 기본 http://10.0.2.2:3000/, release -PMULSIGYE_API_BASE_URL=https://3rd-krc-ai-digital-web.vercel.app/
```

**신규 의존성(전부 tech-stack에서 사전 승인된 범위):**
- `androidx.datastore:datastore-preferences` — tech-stack이 "로컬 저장 = Jetpack DataStore"로 확정한 항목(부트스트랩 제외였으나 단계 5에서 필요). **런타임 승인분.**
- `androidx.compose.foundation:foundation` (BOM) — HorizontalPager·Canvas 명시 확보.
- 테스트 전용: `robolectric` + `androidx.compose.ui:ui-test-junit4` — device 없이 `testDebugUnitTest`에서 Compose UI 테스트 실행. 금지 목록 미해당.
- 추가 안 함: Navigation·Hilt·차트 라이브러리(Canvas 직접)·전역 상태 라이브러리 — 금지 준수.

---

## Global Constraints

- **서버가 판정, Android는 표시(work-plan 규칙·규칙 10).** 단계 임계값(70/60/50/40), 예측값, 밴드 low/high, 도달일(reach.days/targetStage), 추세 버킷, 코치 문구, `highWaterNotice`를 Android에서 재계산하지 않는다. DTO의 값을 그대로 렌더한다. **Android 코드 어디에도 가뭄 임계 상수·예측 산식·95% 만수위 판정을 두지 않는다** — 테스트로 부재를 강제.
- **참고 표현만(규칙 3).** 예측 문구는 "지금 추세가 이어지면 N일 뒤 '단계'에 들어설 가능성이 있어요" 형식 + 모든 예측 화면에 "예측은 참고용이며 공식 가뭄 예·경보가 우선이에요" 병기. "내려가요/됩니다/위험합니다" 금지 — 카피 감사 테스트로 강제.
- **~해요체·고령 농업인(규칙 6).** 본문 15sp↑, 핵심 숫자 큰 글씨, 짧은 문장. "가까운 저수지"·거리·알림 CTA·로그인 CTA 금지.
- **두 저수율 분리.** 게이지 = 대표 저수지 원저수율 `reservoir.rate`(제목 "우리 지역 대표 저수지", 값 라벨 "현재 저수율"), 단계 칩·차트 = `region.avgRatio`/`basis.avgRatio`(보조 라벨 "지역 평년 대비 기준"). 게이지에 단계 눈금 겹치지 않음.
- **카피는 product.md 공유 SSOT.** 웹과 **동일 문구·상태**를 쓴다(카피는 로직 복제가 아니라 공통 SSOT).
- **개인정보.** 주소 원문·검색어는 등록 후 어떤 저장소에도 남기지 않는다. DataStore에는 sigunCode·facCode·consentVersion만 — 테스트로 강제.
- **접근성.** 터치 목표 48dp↑, 아이콘 단독 버튼 `contentDescription`, 차트 `contentDescription` + 시각적 요약, 의미 있는 heading semantics, `rememberReducedMotion()`에서 장식 모션 정지. 색만으로 단계 구분 금지.
- **로딩 패턴.** 메인 = 모듈별 shimmer 스켈레톤(풀스크린 스피너 금지), 주소 검색 = 인라인 스피너, 등록·삭제 = 버튼 내부 스피너 + 중복 입력 잠금, 기준 시각 = "불러오는 중…".
- **stale·mode로 화면 구조 불변.** stale이면 스탬프에 지연 안내만 추가, coach mode 표시 차이 없음. 오프라인 = 마지막 정상 화면 + 명시적 새로고침만 재요청.
- **문서 동기화(규칙 7).** 각 Task의 코드와 관련 문서 갱신을 같은 커밋에 담는다.

**공통 검증 명령(Windows PowerShell):**
```powershell
.\apps\android\gradlew.bat -p .\apps\android :app:lintDebug
.\apps\android\gradlew.bat -p .\apps\android :app:testDebugUnitTest
.\apps\android\gradlew.bat -p .\apps\android :app:assembleDebug
```

---

### Task 1: 의존성·디자인 토큰·UI 프리미티브·reduced-motion·테스트 인프라(Robolectric)

**Files:** libs.versions.toml·build.gradle.kts(datastore·foundation·robolectric·compose-ui-test-junit4 + testOptions **+ release signingConfig 스캐폴드**), core/designsystem/theme(Color·StageColors·Theme·Type), core/ui/ReducedMotion.kt, core/designsystem/component(MulsigyeCard·StageChip·CtaButton·Shimmer·MulsigyeBottomSheet), 테스트 4종, docs/tech-stack.md 갱신, .gitignore(keystore.properties 확인).

**release signingConfig 스캐폴드(비밀값 0):** build.gradle.kts에서 `apps/android/keystore.properties`가 존재하면 그 값으로 release 서명, 없으면 debug 서명 폴백. keystore.properties·*.jks는 커밋 금지(규칙 4·이미 gitignore). 실제 서명 빌드는 사람이 Task 9에서 keystore.properties 작성 후 수행.

**Robolectric 주의:** Compose 테스트는 `@RunWith(RobolectricTestRunner)` + `@Config(sdk=[34])`(런타임 SDK만 낮춤, compileSdk 36 유지) + `@GraphicsMode(NATIVE)`. 공용 Base 규칙으로 묶는다.

- [ ] Step 1: 실패 테스트 먼저 → FAIL
- [ ] Step 2: `:app:lintDebug`·`:app:testDebugUnitTest`·`:app:assembleDebug` → PASS
- [ ] Step 3: `git commit -m "feat(android): 디자인 토큰 전체·UI 프리미티브·reduced-motion·Robolectric 테스트 인프라"`

---

### Task 2: DataStore 지역/동의 저장소 + 계약 DTO·Retrofit API·Repository 4종

**Files:** core/storage/RegionStore.kt(DataStore, 코드 2종+consentVersion만·마이그레이션·주소 미저장), feature/{region,status,forecast,coach}/data/remote/*Api·*ResponseDto(openapi.yaml 1:1), domain/*, data/Default*Repository(health 패턴 폴백·오류 매핑), app/AppContainer.kt(RegionStore+4 Repository 조립), 테스트(RegionStoreTest·*ResponseDtoTest·Default*RepositoryTest with MockWebServer).

**픽스처:** `app/src/test/resources/fixtures/`에 openapi.yaml examples와 산술 정합인 4상태 JSON(정상 84/103·관심 57/68·심각 33/46·만수위 96/118) — 단계 6 웹 교차검증 대비 값 일치.

- [ ] Step 1: 실패 테스트 먼저 → FAIL
- [ ] Step 2: 검증 → PASS
- [ ] Step 3: `git commit -m "feat(android): DataStore 지역/동의 저장소와 status·forecast·coach·regions 계약 DTO·Repository"`

---

### Task 3: 지역 등록 플로우 — RegionList·AddressSearch·RegionAdd

**Files:** feature/region/presentation(RegionListViewModel·Screen·RegionAddViewModel·Screen·AddressSearch). 검색 디바운스 300ms → searchRegions → resolveRegion → 확인 카드 → prepared=false 처리 → 등록(내부 스피너·중복 잠금) → DataStore 코드만 저장. 지역명은 getStatus 병렬 호출로 표시. 테스트: ViewModel(pure JVM) + Screen(Robolectric).

- [ ] Step 1~3 (동일 패턴), commit `"feat(android): 지역 검색·대표 저수지 확인·등록 플로우와 지역 목록"`

---

### Task 4: 메인 상태 모듈 — MainHeader·TodayCard(게이지 Canvas)·HighWaterBanner·스탬프

**Files:** feature/status/presentation(StatusViewModel·MainHeader·TodayCard·ReservoirGauge Canvas·HighWaterBanner), core/ui/AsOfStamp.kt(KST 포맷·stale 문구). 단계는 서버 code/label 표시(임계값 계산 없음), 만수위는 highWaterNotice만. 테스트: 4상태 픽스처·rate null·금지표현 부재·flood만 배너·KST 변환.

- [ ] Step 1~3, commit `"feat(android): 메인 상태 모듈 — 헤더·게이지·단계 칩·만수위 참고 배너·스탬프"`

---

### Task 5: 흐름 차트(Canvas)·ReachCard·TrendChartCard + 흐름 상세 화면

**Files:** feature/forecast/presentation(ForecastViewModel·TrendChart Canvas·ReachCard·TrendChartCard·TrendScreen). 밴드는 API low/high 폴리곤(임의 산식 금지), MAE 캡션은 model 메타(하드코딩 금지), 도달 문구는 reach 값 그대로. 테스트: 밴드 low/high 반영·NaN 방어·결정성·contentDescription·18일/9일/안정 카피·MAE model 값.

- [ ] Step 1~3, commit `"feat(android): 평년 대비 흐름 Canvas 차트·도달 예상 모듈·흐름 상세 화면"`

---

### Task 6: 물시계 코치 카드·근거 고지 모듈·공통 면책 문구

**Files:** feature/coach/presentation(CoachViewModel·CoachCard — mode 3값 구조 동일·오류 격리·채팅 UI 금지), feature/status/presentation/SourcesCard(status∪forecast sources·stale 안내), core/ui/Disclaimer.kt. 테스트: 행동 3개·mode 렌더 동일·채팅 암시 부재·sources 병합.

- [ ] Step 1~3, commit `"feat(android): 물시계 코치 카드·근거 고지 모듈·공통 면책 문구"`

---

### Task 7: 라우터·게이팅·온보딩·동의 바텀시트·스플래시·폴리시 + MulsigyeApp 조립

**Files:** app/AppRouter.kt(sealed Screen + rememberSaveable 백스택 + BackHandler), feature/onboarding(HorizontalPager 3장), feature/consent/ConsentSheet(ModalBottomSheet·필수 2건·딤 닫기 불가·consent-v1 저장), feature/splash(1.5s·reduced-motion 즉시), feature/policy(3종 ~해요체 초안·제출 전 사람 검토), MulsigyeApp.kt 리라이트(게이팅 배선·health 화면 제거), MulsigyeApplication·MainActivity(context 주입). 테스트: AppRouter 게이팅 3분기·BackHandler·ConsentSheet 필수·Onboarding·Policy 문구.

- [ ] Step 1~3, commit `"feat(android): 상태 기반 라우터·게이팅·온보딩·동의 바텀시트·스플래시·폴리시"`

---

### Task 8: 단계 5 게이트 통합 테스트(Robolectric) + 접근성 자동화분 + 문서 게이트 기록

**Files:** app/src/test/kotlin/.../Stage5GateTest.kt(4상태+stale 픽스처 MockWebServer → 실제 Retrofit+Repository+ViewModel+화면 Robolectric 렌더: ① 4상태 정합 ② stale 유지 ③ 카피 감사 ④ 접근성 자동화분 + DTO↔openapi 파싱 정합), docs/testing-and-feedback.md(게이트 명령·수동 QA 위치), docs/work-plan.md(자동화분 통과 기록). (선택) proguard kotlinx.serialization keep 확인.

- [ ] Step 1: 실패 게이트 → FAIL
- [ ] Step 2: 전체 검증 → PASS
- [ ] Step 3: commit `"feat(android): 단계 5 완료 게이트 통합 테스트와 접근성 자동화 검증"` + PR

---

### Task 9 (사람 작업 — 실기기·서명 필요, 서브에이전트 불가)

> device·서명키·실물 QA 필요. PR 머지 후 사람이 수행하고 work-plan 단계 5 게이트·testing-and-feedback 수동 QA에 기록.

**사전 준비:** 서명 keystore는 **이미 존재**(`C:\mulsigye-secrets\mulsigye-release.jks`, 단계 1에서 생성). `apps/android/keystore.properties`(gitignore) 작성 → release signingConfig 배선(에이전트가 keystore.properties 있으면 서명·없으면 debug 폴백으로 미리 스캐폴드, 비밀값 없음). versionCode/versionName 확정.

**빌드·설치:**
```powershell
.\apps\android\gradlew.bat -p .\apps\android :app:assembleRelease -PMULSIGYE_API_BASE_URL=https://3rd-krc-ai-digital-web.vercel.app/
.\apps\android\gradlew.bat -p .\apps\android :app:bundleRelease  -PMULSIGYE_API_BASE_URL=https://3rd-krc-ai-digital-web.vercel.app/
```
서명 release APK를 실기기에 새로 설치.

**실기기 QA(work-plan 단계 5 게이트):**
- [ ] 신규 P0 플로우: 스플래시→온보딩→동의→주소 검색→대표 저수지 등록→메인→흐름 상세→폴리시
- [ ] 큰 글꼴(1.3배↑) 레이아웃 깨짐 없음
- [ ] 하드웨어/제스처 뒤로가기 각 화면 정상
- [ ] TalkBack 읽기 순서·contentDescription
- [ ] 오프라인(비행기모드) 폴백: 마지막 화면 유지·정적 코치·명시적 새로고침만 재요청
- [ ] OS "애니메이션 삭제"에서 장식 모션 정지
- [ ] 웹과 동일 시군·기준시각 수치·단계·행동 일치(단계 6 준비)
- [ ] 로그인·알림 요청 화면 부재

---

## 확정 대기 열린 질문

1. **Navigation 라이브러리**: 상태 기반(기본안·신규 의존성 0) vs navigation-compose 추가.
2. 신규 의존성 패치 버전 고정(DataStore·Robolectric·compose-ui-test·foundation — Compose BOM 2026.06.00·Kotlin 2.3.21 호환) — 기술 결정, 에이전트 처리.
3. release base URL `https://3rd-krc-ai-digital-web.vercel.app/` 확정.
4. release signingConfig 스캐폴드를 에이전트가 미리 넣을지(keystore 이미 존재, 비밀값은 keystore.properties로 사람이).
5. 폴리시 3종 법적 문안: 초안 후 제출 전 사람 검토.
6. LLM_ENABLED=false 데모(Android 정적 코치, 웹과 동일) 확정.
7. 4상태 데모: 계약 픽스처 Robolectric 게이트 + 실 API 정상/심각/stale 수동(기본안).
8. health 화면 제거 vs debug 진입점 유지(제거 권장).
