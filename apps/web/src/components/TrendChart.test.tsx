import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ForecastResponse } from "@mulsigye/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TrendChart } from "./TrendChart";

// packages/contracts/examples의 계약 정합 데모 픽스처를 그대로 재사용한다.
function loadExample<T>(name: string): T {
  // vitest 실행 cwd는 apps/web이다.
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
const NORMAL = loadExample<ForecastResponse>("forecast.normal-demo.json");

/** SVG path d 속성에서 (x, y) 좌표 나열을 파싱한다. */
function parsePathPoints(d: string): Array<[number, number]> {
  return [...d.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

function queryPath(
  container: HTMLElement,
  testId: string,
): SVGPathElement | null {
  return container.querySelector<SVGPathElement>(`[data-testid="${testId}"]`);
}

function getPathPoints(
  container: HTMLElement,
  testId: string,
): Array<[number, number]> {
  const el = queryPath(container, testId);
  expect(el).not.toBeNull();
  return parsePathPoints(el?.getAttribute("d") ?? "");
}

afterEach(() => {
  cleanup();
});

describe("TrendChart 실측·예측 경로", () => {
  it("실측 실선과 예측 점선 경로가 각각 존재하고 점 개수가 데이터와 일치한다", () => {
    const { container } = render(<TrendChart forecast={WATCH} />);

    const actual = getPathPoints(container, "trend-actual");
    const future = getPathPoints(container, "trend-forecast");

    // 실측 30일 = 30점, 예측은 오늘 기준점 + 14일 = 15점.
    expect(actual).toHaveLength(WATCH.history.length);
    expect(future).toHaveLength(WATCH.forecast.length + 1);
  });
});

describe("TrendChart 밴드 — API low/high에서만 유도(임의 산식 금지)", () => {
  it("밴드 폴리곤 y좌표가 low/high를 선형 스케일에 통과시킨 값과 일치한다", () => {
    const { container } = render(<TrendChart forecast={WATCH} />);

    // 실측 경로의 두 점(값이 다른)에서 y 선형 스케일(기울기·절편)을 복원한다.
    const actual = getPathPoints(container, "trend-actual");
    const v0 = WATCH.history[0]!.avgRatio;
    const vLast = WATCH.history[WATCH.history.length - 1]!.avgRatio;
    expect(v0).not.toBe(vLast);
    const y0 = actual[0]![1];
    const yLast = actual[actual.length - 1]![1];
    const slope = (yLast - y0) / (vLast - v0);
    const intercept = y0 - slope * v0;
    const yOf = (value: number) => slope * value + intercept;

    const band = getPathPoints(container, "trend-band");
    const count = WATCH.forecast.length;
    expect(band).toHaveLength(count * 2);

    // 위쪽 가장자리 = high(순방향), 아래쪽 가장자리 = low(역방향).
    const top = band.slice(0, count);
    const bottom = band.slice(count).reverse();
    for (let i = 0; i < count; i += 1) {
      const point = WATCH.forecast[i]!;
      expect(top[i]![1]).toBeCloseTo(yOf(point.high), 0);
      expect(bottom[i]![1]).toBeCloseTo(yOf(point.low), 0);
      // 임의 확장 산식(예: ±0.6+0.28j)이면 위 등식이 깨진다.
      expect(Math.abs(top[i]![1] - yOf(point.high))).toBeLessThan(0.3);
      expect(Math.abs(bottom[i]![1] - yOf(point.low))).toBeLessThan(0.3);
    }
  });
});

describe("TrendChart 임계선 필터", () => {
  it("watch 데모(값 범위 55~87%)에서는 관심·주의 임계선만 렌더한다", () => {
    const { container } = render(<TrendChart forecast={WATCH} />);

    expect(container.textContent).toContain("관심");
    expect(container.textContent).toContain("주의");
    expect(container.textContent).not.toContain("경계");
    expect(container.textContent).not.toContain("심각");
  });

  it("normal 데모(값 범위 93%+)에서는 어떤 임계선도 렌더하지 않는다", () => {
    const { container } = render(<TrendChart forecast={NORMAL} />);

    for (const label of ["관심", "주의", "경계", "심각"]) {
      expect(container.textContent).not.toContain(label);
    }
  });
});

describe("TrendChart 접근성", () => {
  it("role=img와 '지역 평년 대비 저수율'이 든 aria-label, 숨김 요약을 제공한다", () => {
    const { container } = render(<TrendChart forecast={WATCH} />);

    expect(
      screen.getByRole("img", { name: /지역 평년 대비 저수율/ }),
    ).toBeInTheDocument();
    // visually-hidden 요약 텍스트가 존재한다.
    expect(
      container.querySelector('[data-testid="trend-summary"]'),
    ).not.toBeNull();
  });
});

describe("TrendChart 빈 예측 안전 가드", () => {
  it("forecast가 비어도 NaN 좌표 없이 실측 경로만 그린다", () => {
    const empty: ForecastResponse = { ...WATCH, forecast: [] };
    const { container } = render(<TrendChart forecast={empty} />);

    expect(queryPath(container, "trend-actual")).not.toBeNull();
    expect(queryPath(container, "trend-band")).toBeNull();
    expect(queryPath(container, "trend-forecast")).toBeNull();
    expect(container.innerHTML).not.toContain("NaN");
  });

  it("history와 forecast가 모두 비어도 NaN 없이 렌더한다", () => {
    const empty: ForecastResponse = { ...WATCH, history: [], forecast: [] };
    const { container } = render(<TrendChart forecast={empty} />);

    expect(container.innerHTML).not.toContain("NaN");
  });
});

describe("TrendChart 결정성", () => {
  it("같은 입력이면 항상 같은 마크업을 만든다", () => {
    const first = render(<TrendChart forecast={WATCH} />);
    const firstHtml = first.container.innerHTML;
    first.unmount();

    const second = render(<TrendChart forecast={WATCH} />);
    expect(second.container.innerHTML).toBe(firstHtml);
  });
});
