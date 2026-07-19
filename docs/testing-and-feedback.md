# testing-and-feedback.md — 검증 명령과 피드백 루프

> 검증 명령의 SSOT다. “완료”라고 말하기 전에 해당 단계에서 실행 가능한 명령을 직접 실행한다.
> 아직 스캐폴드되지 않은 명령은 성공한 것처럼 보고하지 않는다.

## 현재 단계: 모노레포 부트스트랩

| 목적 | 명령 |
|---|---|
| 하네스 경로 | `pnpm harness:check` |
| 의존성 설치 | `pnpm install --frozen-lockfile` |
| 포맷 검사 | `pnpm format:check` |
| JS 린트 | `pnpm lint` |
| JS 타입 | `pnpm typecheck` |
| JS 테스트 | `pnpm test` |
| JS 빌드 | `pnpm build` |
| OpenAPI | `pnpm openapi:lint` |
| Supabase 시작·적용 | `pnpm supabase:start`, `pnpm supabase:reset` |
| Supabase 검사 | `pnpm supabase:lint`, `pnpm supabase:test` |
| Android 린트 | `.\apps\android\gradlew.bat -p .\apps\android :app:lintDebug` |
| Android 테스트 | `.\apps\android\gradlew.bat -p .\apps\android :app:testDebugUnitTest` |
| Android APK | `.\apps\android\gradlew.bat -p .\apps\android :app:assembleDebug` |

- `supabase:*` 명령은 Docker가 필요하다. 현재 개발 PC에는 Docker가 없으므로 Supabase 런타임
  검증은 `.github/workflows/verify.yml`의 `supabase` job(GitHub Ubuntu runner)에서 수행하고,
  로컬에서는 실행했다고 보고하지 않는다.
- CI는 PR·`main` push마다 `.github/workflows/verify.yml`에서 JS(harness/format/openapi/
  lint/typecheck/test/build + 문서·프로토타입 검사), Android(lintDebug/testDebugUnitTest/
  assembleDebug), Supabase(start/reset/lint/pgTAP)를 실행한다.

## 문서·프로토타입 검사

| 목적 | 명령 |
|---|---|
| 변경 범위 | `git status --short` |
| 공백 오류 | `git diff --check` |
| Markdown 링크 대상 | `powershell -NoProfile -File scripts/check-doc-links.ps1` |
| 프로토타입 상호작용 | `node scripts/check-prototype.mjs` |
| 문서 충돌 감사 | `rg -n "가까운 저수지|알림 켜|WebView|지금 속도면" README.md AGENTS.md docs prototype` 후 허용된 금지 설명 외 0건 확인 |

링크 검사는 저장소 안의 모든 Markdown 상대 경로를 확인한다. URL의 외부 생존 여부는 공모전·데이터
원천을 갱신할 때 별도로 확인한다.

## 다음 단계에서 고정할 명령

| 목적 | 명령 | 현재 상태 |
|---|---|---|
| 데이터 적재·검증 | `pnpm build:data` | 적재 코드 대기 |
| 백테스트 | `pnpm backtest` | 모델 코드 대기 |
| Android 릴리스 APK | `.\apps\android\gradlew.bat -p .\apps\android :app:assembleRelease` | 서명 설정 대기 |
| Play AAB | `.\apps\android\gradlew.bat -p .\apps\android :app:bundleRelease` | 서명 설정 대기 |

## 단위 테스트 최소 범위

1. 예측 모델: 고정 `avgRatio` 입력에 대한 naive/ma7/linear/ses 수치 테스트.
2. 도달일: `68, -0.45 → 18일`, `46, -0.67 → 9일`, 추세 0·상승, 임계값, 30일 초과, 심각 단계.
3. 공식 단계: `70/60/50/40`과 각 경계 바로 위를 모두 검사한다.
4. 대표 저수지: 같은 시군구만 필터, 수혜면적 최대, 동률 `facCode` 오름차순, 후보 없음.
5. XML/CSV 정규화: 결측, wide→long, 날짜·숫자, 100 초과 보존, 격리 리포트.
6. OpenAPI: 실제 Route Handler 응답과 계약 일치, `rate`와 `avgRatio` 의미·단위 분리.
7. 캐시 폴백: 정상, `stale: true`, 재시도 가능/불가능 오류 매핑.
8. 개인정보: 주소 원문이 DB upsert·구조화 로그에 전달되지 않음.
9. Android Repository: 정상·stale·오류 DTO 매핑과 서버 기준값 그대로 표시.
10. localStorage/DataStore: 지역 코드·대표 시설 코드·동의 버전 저장과 버전 마이그레이션.

UI 스냅샷은 만들지 않는다. 시각 회귀 비용 대신 아래 핵심 플로우를 실제 화면으로 확인한다.

## 수동 QA

- [ ] 웹·Android 신규 사용자: 스플래시 → 온보딩 → 약관 동의 → 주소 검색 → 대표 저수지 등록 → 메인
- [ ] 로그인·알림 요청 화면이 어느 플랫폼에도 없음
- [ ] “우리 지역 대표 저수지” 명칭과 대표 시설이 웹·Android에서 같음
- [ ] 게이지 원저수율과 지역 평년 대비 단계·그래프가 라벨로 명확히 구분됨
- [ ] 정상·가뭄 진행·심각 임박·만수위 4개 픽스처에서 숫자와 단계·도달일이 서로 맞음
- [ ] 지역 2개 등록, 전환, 선택 지역 삭제, 빈 상태 처리
- [ ] KRC API·Supabase·LLM 각각 실패 시 마지막 데이터 또는 정적 코치 폴백으로 화면이 유지됨
- [ ] 375px 웹, Android 큰 글꼴 1.3배, TalkBack에서 핵심 흐름 완료
- [ ] 웹 reduced motion·Android 애니메이션 삭제 설정에서 장식 모션 정지
- [ ] 확정 예측 문구와 자체 위험 판정이 없음
- [ ] release APK 실기기 신규 설치 후 핵심 흐름 완료
- [ ] P1 구현 시에만 App Link 설치·미설치 폴백 확인

## 보안·관측성

- Vercel 런타임 로그에는 `{ source, status, fallback, requestId }`만 남기고 비밀값·주소 원문은 남기지 않는다.
- Supabase 적재 리포트에서 원천 기준일, 행 수, 격리 행, 최신 정상 스냅샷을 확인한다.
- Android 로그에는 HTTP 상태·도메인 오류 코드·재시도 여부만 남긴다.
- `.env*`, `local.properties`, keystore, 서명 설정이 git 추적 대상이 아닌지 릴리스 전에 확인한다.

## 성능 가드

- 초기 웹 JS 번들은 gzip 200KB 이하를 목표로 한다. 초과하면 새 의존성 제거를 먼저 검토한다.
- 메인 API는 동일 지역의 status·forecast·coach 중복 원천 조회를 피하고 캐시 적중 여부를 기록한다.
- Android 저속 네트워크에서 마지막 정상 화면을 유지하고 명시적인 새로고침만 재요청한다.
