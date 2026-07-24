import type { ForecastResponse } from "@mulsigye/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StageGuideCard } from "./StageGuideCard";

type StageGuide = NonNullable<ForecastResponse["stageGuide"]>;

// 현재 단계 ok(정상)인 대표 가이드 — 행동 제목은 서버 카탈로그 값을 그대로 옮긴 것.
const OK_GUIDE: StageGuide = [
  {
    code: "ok",
    label: "정상",
    actions: [
      "지금처럼 물 관리를 이어가요",
      "논물 상태를 가끔 확인해요",
      "일주일에 한 번 저수율을 봐요",
    ],
    current: true,
  },
  {
    code: "watch",
    label: "관심",
    actions: ["논물이 새는 곳을 살펴봐요", "물 대는 날을 미리 정해요"],
    current: false,
  },
  {
    code: "care",
    label: "주의",
    actions: ["논물 상태를 확인해요", "급수 일정을 이웃과 맞춰요"],
    current: false,
  },
  {
    code: "alert",
    label: "경계",
    actions: ["물 댈 논의 순서를 정해요", "마을 급수 조율에 참여해요"],
    current: false,
  },
  {
    code: "crit",
    label: "심각",
    actions: ["공식 안내를 먼저 확인해요", "지사에 도움을 요청해요"],
    current: false,
  },
];

afterEach(() => {
  cleanup();
});

describe("StageGuideCard — 서버 stageGuide 렌더", () => {
  it("제목·5단계·행동 제목을 보여준다", () => {
    render(<StageGuideCard stageGuide={OK_GUIDE} />);

    expect(screen.getByText("단계별 행동 가이드")).toBeInTheDocument();
    for (const stage of OK_GUIDE) {
      expect(screen.getByText(stage.label)).toBeInTheDocument();
      for (const action of stage.actions) {
        expect(screen.getByText(action)).toBeInTheDocument();
      }
    }
    // 폴백 표는 그리지 않는다.
    expect(screen.queryByText("가뭄 단계 기준")).not.toBeInTheDocument();
  });

  it("현재 단계(current) 하나만 '지금 우리 지역'으로 강조한다", () => {
    render(<StageGuideCard stageGuide={OK_GUIDE} />);

    const marks = screen.getAllByText("지금 우리 지역");
    expect(marks).toHaveLength(1);
    // 강조 표시는 현재 단계(정상) 행 안에 있다.
    const currentRow = marks[0]?.closest("li");
    expect(currentRow).not.toBeNull();
    expect(
      within(currentRow as HTMLElement).getByText("정상"),
    ).toBeInTheDocument();
  });
});

describe("StageGuideCard — 폴백(구 페이로드)", () => {
  it("stageGuide가 없으면 기존 '가뭄 단계 기준' 표로 폴백한다", () => {
    render(<StageGuideCard stageGuide={undefined} />);

    expect(screen.getByText("가뭄 단계 기준")).toBeInTheDocument();
    expect(screen.queryByText("단계별 행동 가이드")).not.toBeInTheDocument();
    for (const line of [
      "평소처럼 관리하면 돼요",
      "물 사용을 조금씩 아껴요",
      "공동 급수 일정을 확인해요",
      "제한급수·대체수원을 준비해요",
      "관계기관 안내에 따라요",
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
  });
});
