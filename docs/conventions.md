# conventions.md — 작업 규칙

> 첫 커밋 전에 읽는다. 2인 팀 + 에이전트 협업 기준의 최소 규칙이다.

## 브랜치

- `main` = 항상 배포 가능. Vercel 프로덕션이 물려 있다.
- 작업 브랜치: `feat/<주제>`, `fix/<주제>`, `docs/<주제>`, `chore/<주제>` (케밥케이스).
- 마감 특성상 브랜치 수명은 하루 이내를 목표로 한다. 오래 끌지 말고 쪼개서 머지.

## 커밋 (Conventional Commits, 제목은 한국어 허용)

```
feat: 메인 게이지 눈금 외부 배치
fix: 저수율 API 결측 구간 보간 오류 수정
docs: prediction-model 백테스트 결과 기록
chore: pnpm lockfile 갱신
```

- 하나의 커밋 = 하나의 의도. 코드와 관련 docs 갱신은 **같은 커밋**에 담는다.
- 생성물(`data/*.json`) 갱신 커밋은 `chore(data): ...` 로 구분.

## PR (2인 팀 간소 규칙)

- 자기 머지 허용. 단, UI 변경은 Vercel 프리뷰 링크를 디자이너에게 공유 후 머지.
- PR 본문 체크리스트(복붙):
  ```
  - [ ] docs/testing-and-feedback.md 의 검증 명령 통과
  - [ ] 관련 docs 갱신함 (해당 없으면 사유)
  - [ ] 4개 상태(정상/가뭄/심각/장마) 깨짐 없음 (UI 변경 시)
  ```

## 코드 스타일

- ESLint + Prettier 기본값. 논쟁은 도구 설정으로 끝낸다(리뷰에서 스타일 언급 금지).
- 파일명: 컴포넌트 `PascalCase.tsx`, 그 외 `kebab-case.ts`.
- 주석은 "왜"만 적는다. "무엇"은 코드와 docs가 말한다.
- 매직넘버 금지: 가뭄 임계값·캐시 시간·애니메이션 시간은 상수 파일로.

## 문서 동기화 (하네스 유지의 핵심)

- 트리거 표 — 아래 변경이 있으면 해당 문서를 **같은 PR에서** 고친다:

| 변경 | 갱신할 문서 |
|---|---|
| 의존성 추가/제거 | tech-stack.md |
| 폴더/모듈 구조 변경 | architecture.md |
| 데이터 필드·출처 변경 | data-sources.md |
| 모델·지표·표현 규칙 변경 | prediction-model.md |
| 토큰·컴포넌트 패턴 변경 | design-system.md + prototype/ |
| 검증 명령 변경 | testing-and-feedback.md |

- 문서에 없는 결정을 코드에 넣어야 한다면: 코드에 `TODO(decide):` 주석 + 문서의
  '미결정' 절에 항목 추가 후 사람에게 묻는다. **추측으로 확정하지 않는다.**

## 비밀값

`.env.local`만 사용, `.env.example` 커밋. 키가 실수로 커밋되면 즉시 회전(재발급)하고
히스토리에서 제거한다.
