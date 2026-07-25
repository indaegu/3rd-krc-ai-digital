import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ForecastResponse } from "@mulsigye/contracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REGION_STORE_KEY } from "../../lib/client/region-store";
import TrendPage from "./page";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function monthDay(observedOn: string): string {
  const [, m, d] = observedOn.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function seedRegion() {
  window.localStorage.setItem(
    REGION_STORE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      consentVersion: "consent-v1",
      regions: [{ sigunCode: "44230", facCode: "4423010045" }],
      currentIndex: 0,
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(jsonResponse(WATCH))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("흐름 상세 — 평평한 예측선 캡션과 날짜 축", () => {
  it("상세 차트에 평평선 설명 캡션이 있고 x축에 날짜(M/D)가 보인다", async () => {
    seedRegion();
    const { container } = render(<TrendPage />);

    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="trend-flat-note"]'),
      ).not.toBeNull(),
    );

    // 평평선 설명 캡션(상세 전용).
    const note = container.querySelector('[data-testid="trend-flat-note"]');
    expect(note?.textContent).toContain("평평한");
    expect(note?.textContent).toContain("흐린 띠");

    // x축 날짜 라벨 — observedOn에서만.
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

    // 그려-들어오기(reveal) 상태는 RAF·matchMedia 환경차로 불안정하므로 여기서 단언하지
    // 않는다(TrendChart.test.tsx가 reduced-motion 즉시 표시를 전담 검증). 이 테스트는
    // 캡션·날짜 축만 확인한다.
    expect(
      screen.getByRole("heading", { level: 1, name: /지역 평년 대비 저수율/ }),
    ).toBeInTheDocument();
  });

  it("예측이 기울면(평평하지 않으면) 평평선 캡션을 숨긴다", async () => {
    seedRegion();
    // 예측 avgRatio를 하루 1%p씩 올려 기우는 예측을 만든다(naive가 아닌 모델 가정).
    const rising: ForecastResponse = {
      ...WATCH,
      forecast: WATCH.forecast.map((point, index) => ({
        ...point,
        avgRatio: point.avgRatio + index,
      })),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(rising))),
    );

    const { container } = render(<TrendPage />);
    // 상세가 로드될 때까지 기다린 뒤(제목 등장) 캡션 부재를 확인한다.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: /지역 평년 대비 저수율/,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      container.querySelector('[data-testid="trend-flat-note"]'),
    ).toBeNull();
  });
});
