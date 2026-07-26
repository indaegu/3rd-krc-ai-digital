import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ForecastResponse } from "@mulsigye/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrendChartCard } from "./TrendChartCard";

// TrendChartCard는 next/link("자세히" → /trend)를 쓰므로 라우터를 스텁한다.
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

function loadExample<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "packages",
        "contracts",
        "examples",
        name,
      ),
      "utf8",
    ),
  ) as T;
}

const WATCH = loadExample<ForecastResponse>("forecast.watch-demo.json");

/** 컴포넌트와 동일한 "YYYY-MM-DD" → "M/D" 포맷(기대치 계산용). */
function monthDay(observedOn: string): string {
  const [, m, d] = observedOn.split("-");
  return `${Number(m)}/${Number(d)}`;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TrendChartCard 미니 차트", () => {
  it("미니 차트에도 x축 날짜(첫 날짜·오늘·마지막 날짜)를 표시한다(#11)", () => {
    const { container } = render(<TrendChartCard forecast={WATCH} />);

    const firstDate = monthDay(WATCH.history[0]!.observedOn);
    const lastDate = monthDay(
      WATCH.forecast[WATCH.forecast.length - 1]!.observedOn,
    );

    expect(
      container.querySelector('[data-testid="trend-axis-start"]')?.textContent,
    ).toBe(firstDate);
    expect(
      container.querySelector('[data-testid="trend-axis-end"]')?.textContent,
    ).toBe(lastDate);
    expect(container.textContent).toContain("오늘");
  });
});

// 지표 토글 3종(product.md): 지역 평년 대비 예측 · 저수지 실측 · 함께 보기.
// "함께 보기"는 예측선·밴드를 그대로 두고 저수지 실측을 오른쪽 축 참고선으로 얹는다.
describe("TrendChartCard 지표 토글 3종", () => {
  /** 지역 실측 날짜와 겹치도록 forecast.history 끝 3일을 그대로 쓴다. */
  const rates = WATCH.history.slice(-3).map((point, index) => ({
    observedOn: point.observedOn,
    rate: 55 + index,
  }));

  function renderCard() {
    return render(
      <TrendChartCard
        forecast={WATCH}
        reservoirHistory={rates}
        reservoirName="나주호"
      />,
    );
  }

  it("실측 시계열이 있으면 토글 세 개를 보여준다", () => {
    renderCard();
    expect(
      screen.getByRole("button", { name: "지역 평년 대비" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "저수지 실측" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "함께 보기" }),
    ).toBeInTheDocument();
  });

  it("실측 시계열이 없으면 토글을 감춘다", () => {
    render(<TrendChartCard forecast={WATCH} />);
    expect(screen.queryByRole("button", { name: "함께 보기" })).toBeNull();
  });

  it("기본은 지역 평년 대비 — 참고선을 그리지 않는다", () => {
    const { container } = renderCard();
    expect(
      container.querySelector('[data-testid="trend-forecast"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="trend-reservoir"]'),
    ).toBeNull();
  });

  it("함께 보기: 예측선·밴드를 유지한 채 참고선을 덧그린다", () => {
    const { container } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "함께 보기" }));

    // 예측은 여전히 지역 모델 하나뿐이다 — 예측선·밴드가 그대로 있어야 한다.
    expect(
      container.querySelector('[data-testid="trend-forecast"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="trend-band"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="trend-reservoir"]'),
    ).not.toBeNull();
    // 오른쪽 눈금임을 범례·부제에서 밝힌다(같은 축으로 오해하지 않게).
    expect(container.textContent).toContain("오른쪽 눈금");
  });

  it("저수지 실측: 예측선·밴드 없이 관측만 그린다", () => {
    const { container } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "저수지 실측" }));

    expect(
      container.querySelector('[data-testid="trend-forecast"]'),
    ).toBeNull();
    expect(container.querySelector('[data-testid="trend-band"]')).toBeNull();
    expect(container.textContent).toContain("나주호");
  });
});
