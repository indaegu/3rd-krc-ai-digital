# architecture.md — 시스템 구조

> 새 파일/모듈을 만들기 전에 읽는다. 스택 상세는 [tech-stack.md](tech-stack.md).

## 전체 구조 (웹 코어 + WebView 셸)

```
[농업인 브라우저 / WebView 앱 셸]
        │  HTTPS
        ▼
[Next.js on Vercel]
  ├─ UI (App Router 페이지: 온보딩/지역설정/메인/상세)
  ├─ API Routes (/api/*)
  │    ├─ /api/reservoir   저수율 시계열 (캐시 적용)
  │    ├─ /api/forecast    예측 + 도달 예상일
  │    └─ /api/coach       LLM 행동요령 생성
  ├─ lib/prediction        예측 순수 함수 (UI·API에서 공용)
  └─ lib/data              공공데이터 페치·정규화
        │
        ▼
[한국농어촌공사 공공데이터]           [LLM API]
  · 저수지 수위 API (실시간 축)        · 행동요령 문장 생성
  · 일별 저수율 / 논가뭄지도 /
    가뭄예경보 (CSV → 정적 JSON 파이프라인)
```

## 모듈 경계 (의존 방향 — 위반 금지)

```
types → lib/data → lib/prediction → api routes → UI 컴포넌트
```

- UI는 `lib/*`를 직접 import하지 않고 API Route를 거치는 것이 기본.
  (예외: 순수 표시 유틸은 UI에서 직접 사용 가능)
- `lib/prediction`은 **순수 함수만**: `(시계열, 옵션) → {예측배열, 도달일, 오차}`.
  네트워크·시간·랜덤 접근 금지 → 백테스트와 단위테스트가 결정적이 된다.
- 외부 데이터는 `lib/data`의 정규화를 거치지 않고는 어디서도 사용 금지
  (필드명·단위를 한 곳에서만 안다).

## 데이터 흐름 전략

- **실시간 축**: 저수지 수위 API를 API Route에서 호출, 60분 캐시(revalidate).
  API 장애 시 마지막 캐시 + "업데이트 지연" 표시로 폴백 (화면이 죽지 않는다).
- **정적 축**: CSV 3종(일별 저수율·논가뭄지도·가뭄예경보)은 스크립트로 내려받아
  `data/*.json`으로 커밋(파이프라인: `scripts/build-data.*`). 하루 1회 갱신이면 충분.
- 클라이언트 저장: `localStorage` — 키는 `mulsigye.regions`, `mulsigye.consent`.
  스키마 변경 시 키에 버전 접미사(`.v2`)를 붙이고 마이그레이션 코드를 남긴다.

## 폴더 구조 규칙 (스캐폴드 시 이 형태를 따른다)

```
app/            페이지 (스플래시/온보딩은 클라이언트 상태로 분기)
app/api/        API Routes
components/     UI 컴포넌트 (도메인 접두어: Gauge*, Coach*, Region*)
lib/data/       페치·정규화·캐시
lib/prediction/ 모델·백테스트 공용 로직
data/           빌드된 정적 JSON (스크립트 산출물)
scripts/        데이터 파이프라인·백테스트 CLI
docs/           지식 베이스 (이 디렉터리)
prototype/      디자인 스펙 원본 HTML
```

## 배포

- Vercel 프로젝트 1개, `main` 브랜치 = 프로덕션. PR마다 프리뷰 배포.
- 환경변수: `DATA_GO_KR_API_KEY`, `LLM_API_KEY` — Vercel 대시보드에만 저장.
- 제출용 URL은 커스텀 도메인 불필요, `*.vercel.app` 허용. **9/10까지 프로젝트 삭제 금지.**

## 미결정 사항 (결정 시 이 문서를 갱신하라)

- [ ] LLM 제공자·모델 선택 (coach 문장 생성) — 비용/속도 비교 후 확정
- [ ] CSV 3종 자동 갱신 주기(수동 스크립트 vs GitHub Actions cron)
