import { HIGH_WATER_ACTION, STAGE_ACTIONS } from "./action-catalog.js";
import type { ApprovedAction, OfficialStage } from "./types.js";

/**
 * 단계·만수위 참고 여부 → 검토 완료 행동 정확히 3개(결정적 순서).
 * 만수위 참고면 배수로 점검이 1순위, 해당 단계 1·2순위가 뒤따른다.
 * 행동 ID·순서는 서버가 확정하며 LLM은 이를 바꾸지 않는다(AGENTS 규칙 10).
 */
export function selectActions(
  stage: OfficialStage,
  highWaterNotice: boolean,
): ApprovedAction[] {
  const stageActions = STAGE_ACTIONS[stage];

  if (highWaterNotice) {
    return [HIGH_WATER_ACTION, stageActions[0], stageActions[1]];
  }

  return [...stageActions];
}
