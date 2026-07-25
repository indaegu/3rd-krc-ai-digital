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

const ZONE_LABELS = ["정상", "관심", "주의", "경계", "심각"] as const;

describe("TodayCard 상태 4종", () => {
  for (const demo of STAGE_CASES) {
    it(`${demo.name}: 평년 대비 큰 숫자·단계 칩·헤드라인·원저수율 보조 줄을 보여준다`, () => {
      const { container } = render(<TodayCard status={demo.status} />);

      expect(screen.getByText("우리 지역 대표 저수지")).toBeInTheDocument();
      // 큰 숫자 = 지역 평년 대비 avgRatio(게이지·단계와 같은 축). reduced motion → 즉시 최종.
      expect(
        screen.getByText(String(demo.status.region.avgRatio)),
      ).toBeInTheDocument();
      // 단계 칩 라벨은 <strong> — 게이지 단계 눈금 라벨(span)과 구분해 스코프.
      expect(
        screen.getByText(demo.status.region.officialStage.label, {
          selector: "strong",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("지역 평년 대비 기준")).toBeInTheDocument();
      expect(screen.getByText(demo.headline)).toBeInTheDocument();
      // 원저수율(rate)은 작은 보조 줄로 내려간다.
      expect(
        screen.getByText(String(demo.status.reservoir.rate)),
      ).toBeInTheDocument();
      expect(container.textContent).toContain("저수지 실제 저수율은");
      // 게이지 단계 눈금 라벨 5종이 렌더된다(stageBands 존재 경로).
      for (const label of ZONE_LABELS) {
        expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
      }
      expect(container.textContent).not.toMatch(FORBIDDEN_COPY);
    });
  }
});

describe("TodayCard 관측 실패", () => {
  it("rate가 null이면 원저수율 보조 줄에 '아직 없어요'를 보여준다", () => {
    const { container } = render(<TodayCard status={STALE_NULL_RATE} />);

    expect(
      screen.getByText("저수지 실제 저수율은 아직 없어요"),
    ).toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
    // 큰 숫자는 여전히 평년 대비 avgRatio다.
    expect(
      screen.getByText(String(STALE_NULL_RATE.region.avgRatio)),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY);
  });
});

describe("TodayCard 게이지 단계 눈금 폴백", () => {
  it("stageBands가 없으면 게이지 단계 눈금 라벨을 그리지 않는다", () => {
    // stale 데모 픽스처에는 stageBands가 없다(구 페이로드).
    render(<TodayCard status={STALE_NULL_RATE} />);
    // 정상은 단계 칩 라벨로 존재할 수 있으나, 눈금 전용 라벨(경계·심각)은 없어야 한다.
    expect(screen.queryByText("경계")).not.toBeInTheDocument();
    expect(screen.queryByText("심각")).not.toBeInTheDocument();
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

    // 카운트업이 구동하는 큰 숫자(평년 대비 avgRatio)가 즉시 최종 값이어야 한다.
    expect(
      screen.getByText(String(NORMAL.region.avgRatio)),
    ).toBeInTheDocument();
  });
});
