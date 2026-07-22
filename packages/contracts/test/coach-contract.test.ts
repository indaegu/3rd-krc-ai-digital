import { describe, expect, expectTypeOf, it } from "vitest";

import coachStatic from "../examples/coach.static.json" with { type: "json" };
import type { CoachResponse } from "../src/index.js";

const FORBIDDEN_COPY_PATTERN = /위험합니다|발생합니다|됩니다|내려가요/;

describe("coach contract fixtures", () => {
  it("keeps the static fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      mode: "static",
      dataStale: false,
      cacheHit: false,
      generatedAt: "2026-07-21T00:00:00.000Z",
      promptVersion: "coach-v1",
      actionCatalogVersion: "actions-v1",
      coach: {
        headline: "지금 할 일을 하나씩 확인해요.",
        summary: "예측은 참고 정보예요. 공식 가뭄 예·경보를 먼저 확인해요.",
        actions: [
          {
            id: "care_save_paddy_water",
            title: "물꼬를 조금만 열어 두어요",
            reason: "논물을 아껴 쓰면 다음 단계까지 여유가 생겨요.",
          },
          {
            id: "care_check_official_notice",
            title: "공식 가뭄 안내를 확인해요",
            reason: "우리 지역 공식 예·경보가 가장 정확한 기준이에요.",
          },
          {
            id: "care_plan_water_order",
            title: "물 대는 순서를 정해요",
            reason: "필요한 논부터 차례로 물을 대면 부담이 줄어요.",
          },
        ],
      },
      fallbackReason: "disabled",
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["논가뭄지도"],
      stale: false,
    } satisfies CoachResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<CoachResponse>();
    expect(coachStatic).toEqual(contractFixture);
  });

  it("keeps the static example on the disabled fallback with three actions", () => {
    expect(coachStatic.mode).toBe("static");
    expect(coachStatic.fallbackReason).toBe("disabled");
    expect(coachStatic.cacheHit).toBe(false);
    expect(coachStatic.coach.actions).toHaveLength(3);
  });

  it("keeps every user-facing copy free of forbidden assertive endings", () => {
    const copies = [
      coachStatic.coach.headline,
      coachStatic.coach.summary,
      ...coachStatic.coach.actions.flatMap((action) => [
        action.title,
        action.reason,
      ]),
    ];

    for (const copy of copies) {
      expect(copy).not.toMatch(FORBIDDEN_COPY_PATTERN);
      expect(copy.length).toBeGreaterThan(0);
    }
    expect(coachStatic.coach.headline.length).toBeLessThanOrEqual(30);
    expect(coachStatic.coach.summary.length).toBeLessThanOrEqual(100);
    for (const action of coachStatic.coach.actions) {
      expect(action.title.length).toBeLessThanOrEqual(30);
      expect(action.reason.length).toBeLessThanOrEqual(70);
    }
  });

  it("keeps the mode and fallbackReason unions on the coach design spec", () => {
    expectTypeOf<CoachResponse["mode"]>().toEqualTypeOf<
      "llm" | "cache" | "static"
    >();
    expectTypeOf<CoachResponse["fallbackReason"]>().toEqualTypeOf<
      | "disabled"
      | "cache_unavailable"
      | "budget_exceeded"
      | "daily_limit"
      | "generation_in_progress"
      | "timeout"
      | "rate_limited"
      | "provider_error"
      | "refusal"
      | "max_tokens"
      | "validation_failed"
      | null
    >();
  });
});
