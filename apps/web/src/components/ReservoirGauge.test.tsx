import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReservoirGauge } from "./ReservoirGauge";

// 서버 stageBands와 동일 형태(정상→심각, 하한 70/60/50/40/0).
const BANDS = [
  { code: "ok", label: "정상", minRatio: 70 },
  { code: "watch", label: "관심", minRatio: 60 },
  { code: "care", label: "주의", minRatio: 50 },
  { code: "alert", label: "경계", minRatio: 40 },
  { code: "crit", label: "심각", minRatio: 0 },
] as const;

beforeEach(() => {
  // reduced motion으로 스텁해 수위를 즉시 목표 높이로 반영시킨다.
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReservoirGauge 평년 대비 채움·단계 색·눈금", () => {
  it("물 높이는 avgRatio(평년 대비)를 반영한다 — 93.7 → 93.7%", () => {
    const { container } = render(
      <ReservoirGauge avgRatio={93.7} stageCode="ok" stageBands={BANDS} />,
    );
    const water = container.querySelector("[data-fill]");
    expect(water?.getAttribute("data-fill")).toBe("93.7");
    expect(water instanceof HTMLElement && water.style.height).toBe("93.7%");
  });

  it("100 초과 avgRatio는 만수(100%)로 채운다", () => {
    const { container } = render(
      <ReservoirGauge avgRatio={140.1} stageCode="ok" stageBands={BANDS} />,
    );
    expect(
      container.querySelector("[data-fill]")?.getAttribute("data-fill"),
    ).toBe("100");
  });

  it("물 색은 현재 단계 색이다 — data-stage로 단계 토큰을 고른다", () => {
    const { container } = render(
      <ReservoirGauge avgRatio={46} stageCode="alert" stageBands={BANDS} />,
    );
    expect(
      container.querySelector("[data-stage]")?.getAttribute("data-stage"),
    ).toBe("alert");
  });

  it("stageBands가 있으면 단계 눈금 라벨 5종을 그린다", () => {
    render(
      <ReservoirGauge avgRatio={68} stageCode="watch" stageBands={BANDS} />,
    );
    for (const label of ["정상", "관심", "주의", "경계", "심각"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("stageBands가 없으면 눈금선·라벨 없이 채움만 그린다(구 페이로드 폴백)", () => {
    const { container } = render(
      <ReservoirGauge avgRatio={68} stageCode="watch" />,
    );
    // 눈금 컨테이너가 없고 단계 눈금 전용 라벨도 없다.
    expect(container.querySelector("[data-fill]")).not.toBeNull();
    expect(screen.queryByText("경계")).not.toBeInTheDocument();
    expect(screen.queryByText("심각")).not.toBeInTheDocument();
    // 채움·단계 색은 여전히 적용된다.
    expect(
      container.querySelector("[data-stage]")?.getAttribute("data-stage"),
    ).toBe("watch");
  });

  it("avgRatio가 null이면 물을 채우지 않는다(0%)", () => {
    const { container } = render(
      <ReservoirGauge avgRatio={null} stageCode="ok" stageBands={BANDS} />,
    );
    expect(
      container.querySelector("[data-fill]")?.getAttribute("data-fill"),
    ).toBe("0");
  });
});
