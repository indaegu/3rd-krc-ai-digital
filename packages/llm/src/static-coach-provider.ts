import { validateGeneratedCoachCopy } from "./coach-validator.ts";
import type {
  CoachFactPacket,
  CoachProvider,
  GeneratedCoachCopy,
  OfficialStage,
} from "./types.ts";

const HEADLINES: Record<OfficialStage, string> = {
  정상: "지금처럼 물 상황을 살펴봐요.",
  관심: "우리 지역 물 흐름을 살펴봐요.",
  주의: "지금 할 일을 하나씩 확인해요.",
  경계: "물을 아껴 쓸 준비를 해요.",
  심각: "공식 안내를 먼저 확인해요.",
};

export class StaticCoachProvider implements CoachProvider {
  async generate(facts: CoachFactPacket): Promise<GeneratedCoachCopy> {
    return validateGeneratedCoachCopy(facts, {
      headline: HEADLINES[facts.officialStage],
      summary: "예측은 참고 정보예요. 공식 가뭄 예·경보를 먼저 확인해요.",
      actions: facts.actions.slice(0, 3).map(({ id, approvedRationale }) => ({
        id,
        reason: approvedRationale,
      })),
    });
  }
}
