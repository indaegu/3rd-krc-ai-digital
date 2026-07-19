# 물시계 (Mulsigye)

> 농업용수 부족 시점을 예측하고, 농업인에게 지금 해야 할 행동을 알려주는 **AI 물관리 코치**

제3회 KRC AI 디지털 혁신 공모전 · 서비스개발 분야(안전강화) 출품작입니다.

## 무엇이 다른가

기존 포털은 현재 저수율과 공식 가뭄 단계를 보여줍니다. 물시계는 한국농어촌공사
공공데이터의 지역 평년 대비 저수율 추세로 **다음 단계에 이를 가능성이 있는 시점**을
계산하고, 그 전에 할 일을 쉬운 말로 알려줍니다. 자체 예측은 참고 정보이며 공식
가뭄 예·경보가 항상 우선합니다.

- 활용 데이터 5종: 농촌용수 저수지 수위정보 API · 전국 저수지 일별 저수율 · 논가뭄지도 · 가뭄예경보 · 농업기반시설 시설제원_저수지
- AI: 백테스트로 고른 정량 추세 예측 + 서버가 허용한 행동만 설명하는 Claude Opus 4.7
  통제형 코치. Claude 장애·예산 초과 때도 정적 코치가 동작합니다.
- 클라이언트: Next.js 반응형 웹 + Kotlin/Jetpack Compose Android 네이티브 앱
- 공용 기반: Vercel Route Handler API + Supabase PostgreSQL
- 개인정보 원칙: 회원가입·로그인 없음, 주소 원문과 지역 설정은 서버에 저장하지 않음

## 모노레포

- `apps/web`: Next.js 웹과 Vercel API
- `apps/android`: Kotlin/Jetpack Compose 네이티브 앱
- `packages/contracts`: 웹·Android 공용 OpenAPI 계약
- `packages/llm`: Claude 서버 경계와 정적 폴백
- `infra/supabase`: PostgreSQL 마이그레이션과 테스트

## 문서

- 에이전트 진입점·문서 지도: [AGENTS.md](AGENTS.md)
- 공모전 규정·제출물: [docs/contest-rules.md](docs/contest-rules.md)
- 우선순위·구현 순서: [docs/work-plan.md](docs/work-plan.md)
- 지식 베이스: [docs/](docs/)
- 시각 참고용 인터랙티브 프로토타입: [prototype/](prototype/)

## 라이선스

[MIT](LICENSE)
