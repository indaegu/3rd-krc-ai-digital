import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { StatusResponse } from "@mulsigye/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TodayCard } from "./TodayCard";

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

const NORMAL = loadExample<StatusResponse>("status.normal-demo.json");
const WATCH = loadExample<StatusResponse>("status.watch-demo.json");
const SEVERE = loadExample<StatusResponse>("status.severe-demo.json");
const FLOOD = loadExample<StatusResponse>("status.flood-demo.json");
const STALE_NULL_RATE = loadExample<StatusResponse>("status.stale.json");

/** 예측 단정 금지 표현(AGENTS.md 규칙 3, product.md 카피 규칙). */
const FORBIDDEN_COPY = /내려가요|됩니다|위험합니다/;

const STAGE_CASES = [
  {
    name: "정상",
    status: NORMAL,
    headline: "물 사정이 넉넉해요",
  },
  {
    name: "가뭄 진행(관심)",
    status: WATCH,
    headline: "물이 평소보다 조금 부족해요",
  },
  {
    name: "심각 임박(경계)",
    status: SEVERE,
    headline: "물 부족이 빠르게 진행 중이에요",
  },
  {
    name: "장마 만수위",
    status: FLOOD,
    headline: "비가 많아 물은 충분해요",
  },
] as const;

beforeEach(() => {
  // jsdom에는 matchMedia가 없다 — reduced motion으로 스텁해 카운트업을 즉시 완료시킨다.
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("TodayCard 상태 4종", () => {
  for (const demo of STAGE_CASES) {
    it(`${demo.name}: rate·avgRatio·단계 칩·헤드라인·라벨을 보여준다`, () => {
      const { container } = render(<TodayCard status={demo.status} />);

      expect(screen.getByText("우리 지역 대표 저수지")).toBeInTheDocument();
      expect(screen.getByText("현재 저수율")).toBeInTheDocument();
      expect(
        screen.getByText(String(demo.status.reservoir.rate)),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`${demo.status.region.avgRatio}%`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(demo.status.region.officialStage.label),
      ).toBeInTheDocument();
      expect(screen.getByText("지역 평년 대비 기준")).toBeInTheDocument();
      expect(screen.getByText(demo.headline)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(FORBIDDEN_COPY);
    });
  }
});

describe("TodayCard 관측 실패", () => {
  it("rate가 null이면 '관측값을 불러오지 못했어요'를 보여준다", () => {
    const { container } = render(<TodayCard status={STALE_NULL_RATE} />);

    expect(screen.getByText("관측값을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
    expect(
      screen.getByText(`${STALE_NULL_RATE.region.avgRatio}%`),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY);
  });
});

describe("TodayCard 올해 흐름 속 현재 위치", () => {
  it("low 버킷이면 낮은 편·하위 N% 두 줄을 보여준다", () => {
    const status: StatusResponse = {
      ...NORMAL,
      yearlyPosition: {
        year: 2025,
        percentile: 10,
        bucket: "low",
        min: 71.4,
        max: 141.8,
      },
    };
    render(<TodayCard status={status} />);
    expect(screen.getByText("올해 흐름 속 낮은 편이에요")).toBeInTheDocument();
    expect(screen.getByText("올해 저수율 중 하위 10%")).toBeInTheDocument();
  });

  it("high 버킷이면 높은 편·상위 100-N% 두 줄을 보여준다", () => {
    const status: StatusResponse = {
      ...NORMAL,
      yearlyPosition: {
        year: 2025,
        percentile: 93,
        bucket: "high",
        min: 107,
        max: 143.3,
      },
    };
    render(<TodayCard status={status} />);
    expect(screen.getByText("올해 흐름 속 높은 편이에요")).toBeInTheDocument();
    expect(screen.getByText("올해 저수율 중 상위 7%")).toBeInTheDocument();
  });

  it("mid 버킷이면 보통 수준·중간 두 줄을 보여준다", () => {
    const status: StatusResponse = {
      ...NORMAL,
      yearlyPosition: {
        year: 2025,
        percentile: 50,
        bucket: "mid",
        min: 71.4,
        max: 141.8,
      },
    };
    render(<TodayCard status={status} />);
    expect(
      screen.getByText("올해 흐름 속 보통 수준이에요"),
    ).toBeInTheDocument();
    expect(screen.getByText("올해 저수율 중 중간")).toBeInTheDocument();
  });

  it("yearlyPosition이 없으면 올해 흐름 문구를 렌더하지 않는다", () => {
    // NORMAL 데모 픽스처에는 yearlyPosition이 없다.
    render(<TodayCard status={NORMAL} />);
    expect(screen.queryByText(/올해 흐름 속/)).not.toBeInTheDocument();
    expect(screen.queryByText(/올해 저수율 중/)).not.toBeInTheDocument();
  });
});

describe("TodayCard reduced motion 안전 가드", () => {
  it("matchMedia가 없는 환경(jsdom)에서도 즉시 최종 값을 보여준다", () => {
    vi.unstubAllGlobals();

    render(<TodayCard status={NORMAL} />);

    expect(screen.getByText(String(NORMAL.reservoir.rate))).toBeInTheDocument();
  });
});
