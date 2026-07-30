/** 운영 모델. 환경변수 ANTHROPIC_MODEL로 덮어쓸 수 있다(캐시 키에 모델이 들어간다). */
export const ANTHROPIC_MODEL = "claude-sonnet-5" as const;

/**
 * 한 번 호출에 허용하는 응답 토큰.
 *
 * 출력은 headline 30자 + summary 100자 + 행동 3개 × 사유 70자로 묶여 있어 한글 340자
 * 남짓이다. 여기에 JSON 구조와 행동 ID가 더해지면 종전 값 256은 자주 모자랐고, 모자라면
 * stop_reason이 max_tokens로 와서 통째로 버려진 뒤 정적 코치로 떨어진다. 사용자 눈에는
 * "AI가 안 도는 서비스"로 보이므로 넉넉히 잡는다. 길이 상한은 검증기가 따로 지킨다.
 */
export const LLM_MAX_TOKENS = 1_024;

/**
 * provider 호출 제한 시간.
 *
 * 종전 8초는 구조화 출력 한 번을 받기에 빠듯해 정상 생성도 타임아웃으로 버려졌다.
 * 상류(수위 API·Supabase) 조회에 2~4초가 이미 들어가므로, 라우트의 maxDuration 30초
 * 안에서 이 값과 합쳐도 여유가 남도록 20초로 둔다.
 */
export const LLM_TIMEOUT_MS = 20_000;
