import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ForecastResponse } from "@mulsigye/contracts";
import { cleanup, render } from "@testing-library/react";
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
