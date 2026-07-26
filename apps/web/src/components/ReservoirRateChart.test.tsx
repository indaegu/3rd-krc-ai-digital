// 대표 저수지 실측 차트 — 30일 구간에서도 날짜 눈금이 겹치지 않고 여러 개 보이는지 검증한다.
// 양 끝만 보여 흐름을 읽기 어렵다는 피드백에서 나온 규칙이다(chart-axis 공용 간격).

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LABEL_SLOT, PAD_LEFT, PLOT_WIDTH } from "./chart-axis";
import { ReservoirRateChart } from "./ReservoirRateChart";

afterEach(() => {
  cleanup();
});

/** 2026-07-01부터 하루씩, 저수율은 결정적으로 흔들리게(랜덤 금지). */
function history(days: number) {
  return Array.from({ length: days }, (_, index) => ({
    observedOn: new Date(Date.UTC(2026, 6, 1 + index))
      .toISOString()
      .slice(0, 10),
    rate: 60 + Math.round(Math.sin(index / 3) * 40) / 10,
  }));
}

function tickTexts(container: HTMLElement): { x: number; text: string }[] {
  return [...container.querySelectorAll("text")].map((node) => ({
    x: Number(node.getAttribute("x")),
    text: node.textContent ?? "",
  }));
}

describe("ReservoirRateChart 날짜 눈금", () => {
  it("30일이면 양 끝 말고도 사이 날짜를 보여준다", () => {
    const { container } = render(<ReservoirRateChart history={history(30)} />);
    const ticks = tickTexts(container);
    expect(ticks.length).toBeGreaterThan(2);
    // 첫 날짜·마지막 날짜는 항상 있다.
    expect(ticks[0]?.text).toBe("7/1");
    expect(ticks.at(-1)?.text).toBe("7/30");
  });

  it("눈금끼리 라벨 한 칸보다 좁아지지 않는다", () => {
    for (const days of [30, 14, 7, 3]) {
      const { container, unmount } = render(
        <ReservoirRateChart history={history(days)} />,
      );
      const xs = tickTexts(container).map((tick) => tick.x);
      for (let i = 1; i < xs.length; i += 1) {
        expect(
          (xs[i] ?? 0) - (xs[i - 1] ?? 0),
          `${String(days)}일 눈금 간격`,
        ).toBeGreaterThanOrEqual(LABEL_SLOT);
      }
      unmount();
    }
  });

  it("좌표계는 chart-axis 공용 상수를 쓴다", () => {
    const { container } = render(<ReservoirRateChart history={history(30)} />);
    const ticks = tickTexts(container);
    expect(ticks[0]?.x).toBe(PAD_LEFT);
    expect(ticks.at(-1)?.x).toBe(PAD_LEFT + PLOT_WIDTH);
  });

  it("점이 2개 미만이면 아무것도 그리지 않는다", () => {
    const { container } = render(<ReservoirRateChart history={history(1)} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
