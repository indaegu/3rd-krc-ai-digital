import type { ApprovedAction, OfficialStage } from "./types.ts";

export const ACTION_CATALOG_VERSION = "actions-v1" as const;

/**
 * 검토 완료 행동 카탈로그. 코치가 노출하는 행동 카피의 유일한 출처다.
 * 카피 규칙(docs/product.md): ~해요체·짧은 문장, 예측 단정 표현 금지,
 * 심각 단계는 공식 안내 확인 위임형, 만수위는 "참고" 톤·홍수 판정 금지.
 */
export const STAGE_ACTIONS: Record<
  OfficialStage,
  readonly [ApprovedAction, ApprovedAction, ApprovedAction]
> = {
  정상: [
    {
      id: "normal_keep_watering",
      approvedTitle: "지금처럼 물 관리를 이어가요",
      approvedRationale: "저수율이 안정적이에요. 하던 대로 물꼬를 관리해요.",
    },
    {
      id: "normal_check_field_water",
      approvedTitle: "논물 상태를 가끔 확인해요",
      approvedRationale: "물이 새는 곳이 없는지 한 번씩 살펴봐요.",
    },
    {
      id: "normal_follow_trend",
      approvedTitle: "일주일에 한 번 저수율을 봐요",
      approvedRationale: "우리 지역 저수율 흐름만 확인하면 충분해요.",
    },
  ],
  관심: [
    {
      id: "watch_check_leak",
      approvedTitle: "논물이 새는 곳을 살펴봐요",
      approvedRationale: "물꼬와 논둑에서 새는 물만 줄여도 도움이 돼요.",
    },
    {
      id: "watch_plan_watering",
      approvedTitle: "물 대는 날을 미리 정해요",
      approvedRationale: "필요한 날에만 물을 대면 아낄 수 있어요.",
    },
    {
      id: "watch_follow_trend",
      approvedTitle: "저수율 흐름을 자주 확인해요",
      approvedRationale: "추세가 이어지는지 이틀에 한 번 살펴봐요.",
    },
  ],
  주의: [
    {
      id: "care_check_field_water",
      approvedTitle: "논물 상태를 확인해요",
      approvedRationale: "물이 새는 곳이 없는지 먼저 살펴봐요.",
    },
    {
      id: "care_share_schedule",
      approvedTitle: "급수 일정을 이웃과 맞춰요",
      approvedRationale: "같은 시간에 물이 몰리지 않게 일정을 나눠요.",
    },
    {
      id: "care_keep_water",
      approvedTitle: "논에 댄 물을 오래 가둬요",
      approvedRationale: "물꼬를 잘 막으면 한 번 댄 물이 오래 가요.",
    },
  ],
  경계: [
    {
      id: "alert_set_priority",
      approvedTitle: "물 댈 논의 순서를 정해요",
      approvedRationale: "꼭 필요한 논부터 물을 대면 낭비가 줄어요.",
    },
    {
      id: "alert_village_meeting",
      approvedTitle: "마을 급수 조율에 참여해요",
      approvedRationale: "이장님과 급수 순서를 함께 정해요.",
    },
    {
      id: "alert_check_notice",
      approvedTitle: "가뭄 예·경보를 확인해요",
      approvedRationale: "공식 안내가 우선이에요. 지사 안내를 함께 살펴봐요.",
    },
  ],
  심각: [
    {
      id: "crit_follow_official",
      approvedTitle: "공식 안내를 먼저 확인해요",
      approvedRationale: "공사와 지자체의 공식 안내에 따라 움직여요.",
    },
    {
      id: "crit_follow_rationing",
      approvedTitle: "마을 급수 순서를 지켜요",
      approvedRationale: "정해진 순서대로 물을 대면 모두가 나눠 쓸 수 있어요.",
    },
    {
      id: "crit_ask_office",
      approvedTitle: "지사에 도움을 요청해요",
      approvedRationale: "급한 상황이면 공사 지사에 바로 문의해요.",
    },
  ],
};

/** 만수위 참고 행동. 홍수 판정이 아니라 "참고" 안내다. */
export const HIGH_WATER_ACTION: ApprovedAction = {
  id: "hw_check_drain",
  approvedTitle: "배수로를 미리 살펴봐요",
  approvedRationale: "참고용 안내예요. 물길이 막힌 곳이 없는지 확인해요.",
};

export const ALL_APPROVED_ACTIONS: readonly ApprovedAction[] = [
  ...Object.values(STAGE_ACTIONS).flat(),
  HIGH_WATER_ACTION,
];
