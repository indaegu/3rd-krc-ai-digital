# tech-stack.md — 기술 스택과 선택 이유

> 라이브러리를 추가하기 전에 읽는다. 상태가 '제안'인 항목은 팀 확정 후 '확정'으로
> 바꾸고 이 문서를 갱신한다. **확정 전 임의 스캐폴드 금지** (AGENTS.md 규칙 8).

## 스택 표

| 영역 | 선택 | 상태 | 이유 |
|---|---|---|---|
| 프레임워크 | Next.js 15 (App Router) | 제안 | 웹 코어+API를 한 저장소·한 배포로. Vercel과 궁합 |
| 언어 | TypeScript (strict) | 제안 | 공공데이터 필드 실수를 타입으로 차단 |
| 스타일 | CSS Modules 또는 vanilla-extract | 제안 | 프로토타입의 CSS 토큰을 거의 그대로 이식 가능 |
| 폰트 | Pretendard Variable (self-host) | 확정 | 디자인 확정 사항. CDN 의존 금지, 저장소에 포함 |
| 차트 | 직접 그린 SVG | 확정 | 프로토타입 렌더러 이식. 차트 라이브러리 금지(아래) |
| 예측 로직 | TypeScript 직접 구현 | 확정 | 선형회귀·지수평활은 수십 줄. 별도 런타임 불필요 |
| 백테스트 CLI | Node 스크립트 (`scripts/backtest.ts`) | 제안 | 예측 로직과 같은 코드 재사용 → 수치 불일치 방지 |
| LLM (코치) | 미정 | 미정 | architecture.md 미결정 사항 참조 |
| 저장 | localStorage | 확정 | 로그인 없는 서비스. 키 규칙은 architecture.md |
| 배포 | Vercel | 확정 | 팀이 이미 사용. PR 프리뷰로 디자이너 리뷰 |
| 패키지 매니저 | pnpm | 제안 | 설치 속도. corepack으로 버전 고정 |
| 린트/포맷 | ESLint + Prettier | 제안 | 기본 규칙 + 커스텀 규칙(하단) |
| 앱 셸 | WebView 래퍼 (여유 시) | 보류 | 웹 URL이 제출 요건. 셸은 7/31 이후 검토 |

## 금지 (에이전트가 흔히 저지르는 실수 차단)

- **차트 라이브러리 추가 금지** (recharts, chart.js 등). SVG 직접 렌더가 확정이다.
  이유: 번들 크기, 프로토타입과의 시각 일치, 커스텀 파형(예측 점선·불확실 밴드) 자유도.
- **CSS 프레임워크 추가 금지** (Tailwind 포함) — 디자이너가 토큰 기반 CSS로 작업 중.
  결정 변경은 디자이너 합의 + 이 문서 갱신이 선행돼야 한다.
- **상태관리 라이브러리 금지** (Redux/Zustand 등). 화면 5개 규모, React 상태 + localStorage로 충분.
- **모멘트류 날짜 라이브러리 금지**. `Date` + `Intl` 로 해결, 필요하면 `date-fns` 개별 함수만.
- API 키를 코드/커밋에 넣지 않는다. `.env.local` + Vercel 환경변수만.

## 버전 고정 원칙

- `package.json`에 캐럿(^) 대신 정확한 버전을 적고 lockfile을 커밋한다.
- Node 버전은 `.nvmrc`(또는 `package.json engines`)로 고정한다 — 값은 스캐폴드 때 기록.

## 이 문서의 갱신 트리거

의존성 추가/제거, '제안 → 확정' 전환, 금지 항목 해제 — 모두 같은 PR에서 이 표를 고친다.
