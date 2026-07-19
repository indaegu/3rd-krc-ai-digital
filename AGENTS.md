# AGENTS.md — 물시계(Mulsigye) 하네스 진입점

> 이 파일은 **지도(목차)** 다. 백과사전이 아니다. 상세 내용은 `docs/`에 있고,
> 에이전트는 작업에 필요한 문서만 골라 읽는다(점진적 공개).
> 사람용 소개는 `README.md`, 에이전트용 진입점은 이 파일이다.

## 프로젝트 한 줄 정의

**물시계** — 농업용수 부족 시점을 예측하고, 농업인에게 지금 해야 할 행동을
알려주는 AI 물관리 코치. (부가: 만수위 접근 시 '참고' 알림)

- 목적: 제3회 KRC AI 디지털 혁신 공모전 · 서비스개발 분야(안전강화) 출품
- 팀: 개발자 1명 + 디자이너 1명
- 마감: **2026-07-31 제출** / 서비스 URL은 **2026-09-10(발표심사)까지 유지**

## 저장소 지도

```
/                        ← 로컬 루트: C:\workspace\3rd-krc-ai-digital
├── AGENTS.md            ← (이 파일) 하네스 진입점·목차
├── CLAUDE.md            ← Claude Code용 포인터 (AGENTS.md 참조)
├── README.md            ← 사람(심사위원 포함)용 프로젝트 소개
├── docs/                ← 지식 베이스 (아래 목차 참조)
├── prototype/           ← 디자인 스펙 원본 (인터랙티브 HTML 프로토타입)
└── (앱 코드)            ← 스캐폴드 후 docs/architecture.md 의 구조를 따른다
```

## 문서 목차 — 무엇을, 언제 읽나

| 문서 | 내용 | 이런 작업 전에 읽어라 |
|---|---|---|
| [docs/product.md](docs/product.md) | 서비스 정의·사용자 흐름·화면 명세 | 기능 구현, 카피 작성 전 |
| [docs/architecture.md](docs/architecture.md) | 시스템 구조·모듈 경계·데이터 흐름 | 새 파일/모듈 생성 전 |
| [docs/tech-stack.md](docs/tech-stack.md) | 기술 스택과 선택 이유·금지 사항 | 라이브러리 추가 전 |
| [docs/data-sources.md](docs/data-sources.md) | 공공데이터 4종 명세·가뭄단계 기준 | 데이터 페치/가공 코드 전 |
| [docs/prediction-model.md](docs/prediction-model.md) | 예측 모델·백테스트 프로토콜 | 예측/백테스트 코드 전 |
| [docs/design-system.md](docs/design-system.md) | 디자인 토큰·컴포넌트·애니메이션 규칙 | UI 작업 전 (스펙 원본: prototype/) |
| [docs/conventions.md](docs/conventions.md) | 코드·커밋·브랜치·문서 동기화 규칙 | 첫 커밋 전 필독 |
| [docs/testing-and-feedback.md](docs/testing-and-feedback.md) | 검증 명령·피드백 루프·QA 시나리오 | PR 올리기 전 |
| [docs/milestones.md](docs/milestones.md) | 일정·제출물 체크리스트 | 작업 우선순위 판단 시 |

## 절대 규칙 (Non-negotiables)

1. **마감이 왕이다.** 7/31까지 동작하는 URL > 완벽한 코드. 범위 추가보다 완성.
2. **KRC 공공데이터를 반드시 사용한다.** 데이터 목록·제약은 docs/data-sources.md 참조.
   공모전 규정상 필수 요건이다.
3. **예측은 항상 '참고' 표현.** "~할 것으로 보여요", "가능성이 있어요"만 허용.
   확정 표현("~됩니다", "위험합니다") 금지. 공식 가뭄 예·경보가 항상 우선임을 UI에 명시.
4. **API 키·비밀값 커밋 금지.** `.env`만 사용, `.env.example`로 형태만 공유.
5. **가뭄단계는 공인 기준만 사용.** 평년 대비 70/60/50/40% (관심/주의/경계/심각).
   자체 위험 판정 기준을 만들지 않는다.
6. **카피는 ~해요체, 짧은 문장.** 1차 타깃은 고령 농업인이다.
7. **코드를 바꾸면 해당 docs도 같은 커밋/PR에서 갱신한다.** 문서가 낡으면 하네스가 죽는다.
8. **스택 확정 전 임의 스캐폴드 금지.** docs/tech-stack.md 의 '확정' 표시를 따른다.

## 개발 환경 & 명령어

- 로컬 루트(개발자 PC): `C:\workspace\3rd-krc-ai-digital` (Windows)
- 배포 대상: Vercel (docs/architecture.md 참조)
- 실행/검증 명령: **docs/testing-and-feedback.md 가 단일 출처(SSOT)다.**
  스캐폴드 직후, 실제 동작하는 명령으로 그 문서를 갱신하는 것이 첫 번째 작업이다.

## 작업 흐름 요약

1. 작업 전: 위 목차에서 관련 문서를 읽는다.
2. 작업 중: docs/conventions.md 의 규칙을 따른다.
3. 작업 후: docs/testing-and-feedback.md 의 검증 명령을 통과시킨다.
4. 커밋: 코드 + 갱신된 문서를 함께 커밋한다.
5. 막히면: 추측으로 구현하지 말고, 문서에 없는 결정은 TODO로 표시하고 사람에게 묻는다.
