import type { CoachFactPacket, ReachBucket, TrendBucket } from "./types.js";

export const PROMPT_VERSION = "coach-v1" as const;

/**
 * 프롬프트에는 수치·날짜·지역명을 넣지 않는다(설계 spec 7절).
 * 버킷 코드도 숫자 없는 우리말 표현으로 바꿔 전달한다 — 정확한 일수·비율은
 * LLM이 아니라 서버 UI가 표시한다.
 */
const REACH_LABELS: Record<ReachBucket, string> = {
  none: "다음 단계 도달 전망 없음",
  within_7d: "일주일 안에 다음 단계 도달 가능",
  within_14d: "보름 안에 다음 단계 도달 가능",
  within_30d: "한 달 안에 다음 단계 도달 가능",
};

const TREND_LABELS: Record<TrendBucket, string> = {
  rising: "오르는 흐름",
  stable: "안정된 흐름",
  falling: "내리는 흐름",
};

const SYSTEM_PROMPT = [
  "당신은 농업인을 돕는 물관리 코치 문장 작성기예요.",
  "",
  "역할 경계(반드시 지켜요):",
  "- 서버가 준 사실만 사용해요. 수치, 날짜, 지역 이름, 기상 사실을 새로 만들지 않아요.",
  '- 지역은 이름 대신 항상 "우리 지역"이라고 불러요.',
  "- 공식 단계나 예측을 다시 계산하거나 고치지 않아요.",
  "- 행동 목록의 ID, 순서, 개수를 서버가 준 그대로 유지해요. 새 행동을 만들거나 빼거나 순서를 바꾸지 않아요.",
  "",
  "문체 규칙:",
  "- 모든 문장은 짧고 쉬운 ~해요체로 써요. 군더더기 없이 써요.",
  '- 확정·단정 표현을 금지해요: "위험합니다", "발생합니다", "됩니다", "내려가요"는 절대 쓰지 않아요.',
  "- 전문적인 농업·시설·안전 판단을 대신하는 표현을 쓰지 않아요.",
  "- summary에는 예측이 참고 정보라는 점을 꼭 담아요.",
  "",
  "출력 규칙(분량을 꼭 지켜요):",
  "- JSON만 출력해요. 다른 텍스트를 붙이지 않아요.",
  "- headline: 15자 안팎 한 줄.",
  "- summary: 두 문장 이내, 60자 안팎.",
  "- actions: 입력과 같은 ID·순서·개수로, 각 항목에 reason 한 문장(40자 안팎).",
].join("\n");

export function buildCoachPrompt(facts: CoachFactPacket): {
  system: string;
  user: string;
} {
  const actionLines = facts.actions.map(
    (action) =>
      `- id: ${action.id} / 행동: ${action.approvedTitle} / 검토된 근거: ${action.approvedRationale}`,
  );

  const user = [
    "[우리 지역 상태]",
    `- 공인 가뭄 단계: ${facts.officialStage}`,
    `- 계절: ${facts.season}`,
    `- 예측 참고: ${REACH_LABELS[facts.reachBucket]}`,
    `- 최근 추세: ${TREND_LABELS[facts.trendBucket]}`,
    `- 만수위 참고: ${facts.highWaterNotice ? "있음" : "없음"}`,
    "",
    "[행동 목록 — ID·순서·개수 그대로 유지]",
    ...actionLines,
    "",
    "위 사실만으로 headline, summary, actions의 reason을 JSON으로 작성해요.",
  ].join("\n");

  return { system: SYSTEM_PROMPT, user };
}
