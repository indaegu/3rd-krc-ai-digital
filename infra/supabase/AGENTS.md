# infra/supabase 작업 규칙

읽기 순서: `../../AGENTS.md` → `../../docs/architecture.md` →
`../../docs/llm-coach.md` → `../../docs/testing-and-feedback.md`.

- 마이그레이션은 timestamp 오름차순 append-only이며 이미 적용한 파일을 되돌려 쓰지 않는다.
- Auth와 사용자 프로필을 만들지 않고 주소 원문, IP, 기기 ID, 프롬프트·응답 전문을 저장하지 않는다.
- 서버 전용 테이블은 RLS를 켜고 anon/authenticated 공개 정책을 만들지 않는다.
- 브라우저·Android가 Supabase에 직접 접근하는 정책이나 공개 키 전제를 만들지 않는다.
- 완료 전 깨끗한 로컬 DB에서 reset, lint, pgTAP test를 실행한다. 로컬에 Docker가 없으면
  CI(GitHub Actions Ubuntu)의 supabase job 통과로 대신한다.
