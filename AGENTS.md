# AGENTS.md — 물시계(Mulsigye) 하네스 진입점

> 이 파일은 **지도(목차)** 다. 백과사전이 아니다. 상세 내용은 `docs/`에 있고,
> 에이전트는 작업에 필요한 문서만 골라 읽는다(점진적 공개).
> 사람용 소개는 `README.md`, 에이전트용 진입점은 이 파일이다.

## 프로젝트 한 줄 정의

**물시계** — 농업용수 부족 시점을 예측하고, 농업인에게 지금 해야 할 행동을
알려주는 AI 물관리 코치. (부가: 만수위 접근 시 '참고' 안내)

- 목적: 제3회 KRC AI 디지털 혁신 공모전 · 서비스개발 분야(안전강화) 출품
- 팀: 개발자 1명 + 디자이너 1명
- 마감: **2026-07-31 제출** / 서비스 URL은 **2026-09-10(발표심사)까지 유지**

## 저장소 지도

```
/                        ← 로컬 루트: C:\workspace\3rd-krc-ai-digital
├── AGENTS.md            ← (이 파일) 하네스 진입점·목차
├── CLAUDE.md            ← Claude Code용 포인터 (AGENTS.md 참조)
├── README.md            ← 사람(심사위원 포함)용 프로젝트 소개
├── .env.example         ← 서버 환경변수 이름만 공유 (값 금지)
├── docs/                ← 지식 베이스 (아래 목차 참조)
├── prototype/           ← 인터랙티브 시각 참고물 (문서 SSOT를 따름)
├── scripts/             ← 데이터·백테스트·문서 검증 CLI
├── app/, lib/           ← 스캐폴드 후 Next.js 웹·공용 API 코드
├── android/             ← 스캐폴드 후 Kotlin/Compose 네이티브 앱
├── contracts/           ← 웹·Android 공용 OpenAPI 계약
└── supabase/            ← PostgreSQL 스키마 마이그레이션
```

## 문서 목차 — 무엇을, 언제 읽나

| 문서 | 내용 | 이런 작업 전에 읽어라 |
|---|---|---|
| [docs/contest-rules.md](docs/contest-rules.md) | 공모전 자격·제출·심사·권리 기준선 | 제출 범위·일정·기획서 판단 전 |
| [docs/work-plan.md](docs/work-plan.md) | 구현 순서·의존성·완료 게이트 | 다음 작업 선택·분할 전 |
| [docs/product.md](docs/product.md) | 서비스 정의·사용자 흐름·화면 명세 | 기능 구현, 카피 작성 전 |
| [docs/architecture.md](docs/architecture.md) | 시스템 구조·모듈 경계·데이터 흐름 | 새 파일/모듈 생성 전 |
| [docs/tech-stack.md](docs/tech-stack.md) | 기술 스택과 선택 이유·금지 사항 | 라이브러리 추가 전 |
| [docs/data-sources.md](docs/data-sources.md) | KRC 공공데이터 5종·대표지·가뭄단계 기준 | 데이터 페치/가공 코드 전 |
| [docs/prediction-model.md](docs/prediction-model.md) | 예측 모델·백테스트 프로토콜 | 예측/백테스트 코드 전 |
| [docs/design-system.md](docs/design-system.md) | 디자인 토큰·컴포넌트·애니메이션 규칙 | 웹·Android UI 작업 전 |
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
   Android keystore·서명 비밀번호·`keystore.properties`도 커밋하지 않는다.
5. **가뭄단계는 공인 기준만 사용.** 평년 대비 70/60/50/40% (관심/주의/경계/심각).
   자체 위험 판정 기준을 만들지 않는다.
6. **카피는 ~해요체, 짧은 문장.** 1차 타깃은 고령 농업인이다.
7. **코드를 바꾸면 해당 docs도 같은 커밋/PR에서 갱신한다.** 문서가 낡으면 하네스가 죽는다.
8. **문서 밖 스택으로 임의 스캐폴드 금지.** 선택은 docs/tech-stack.md를 따르고 버전을 lockfile에 고정한다.
9. **기본 전달은 `main` 대상 PR이다.** 문서·소스 변경 요청에 별도 전달 지시가 없으면
   작업 브랜치에서 검증·커밋·푸시 후 PR까지 만든다. 사용자가 "바로 main에 넣어라"처럼
   직접 반영을 명시한 경우에만 검증 후 `origin/main`에 직접 푸시한다.

## 기준 우선순위

문서가 충돌하면 아래 순서로 판단한다. 낮은 단계의 파일이 높은 단계의 결정을 덮지 못한다.

1. `AGENTS.md`의 절대 규칙
2. `docs/contest-rules.md`의 공식 공모전 기준
3. 도메인 SSOT: `product` / `data-sources` / `prediction-model`
4. 구현 SSOT: `architecture` / `tech-stack` / `testing-and-feedback`
5. 시각 SSOT: `design-system`
6. `prototype/`의 인터랙티브 시각 참고본
7. `work-plan`의 실행 순서와 현재 상태

프로토타입은 비즈니스 규칙이나 데이터 수학의 근거가 아니다. 상위 문서와 다르면 상위 문서에
맞춰 프로토타입을 고친다.

## 개발 환경 & 명령어

- 로컬 루트(개발자 PC): `C:\workspace\3rd-krc-ai-digital` (Windows)
- 배포 대상: Vercel + Supabase + Android APK/AAB (docs/architecture.md 참조)
- 실행/검증 명령: **docs/testing-and-feedback.md 가 단일 출처(SSOT)다.**
  스캐폴드 직후, 실제 동작하는 명령으로 그 문서를 갱신하는 것이 첫 번째 작업이다.

## 작업 흐름 요약

1. 작업 전: `git status`와 `docs/work-plan.md`를 확인하고 관련 SSOT만 읽는다.
2. 작업 시작: 목표·입력·파일·검증·문서 갱신 범위를 고정한다.
3. 작업 중: docs/conventions.md 의 규칙을 따른다.
4. 작업 후: docs/testing-and-feedback.md 의 관련 검증 명령을 통과시킨다.
5. 전달: 코드 + 갱신된 문서를 함께 커밋하고 규칙 9에 따라 PR 또는 직접 푸시한다.
6. 막히면: 안전한 범위의 확인을 먼저 소진하고, 제품 범위를 바꾸는 결정만 사람에게 묻는다.
