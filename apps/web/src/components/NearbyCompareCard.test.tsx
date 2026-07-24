import type { NearbyResponse } from "@mulsigye/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NearbyCompareCard } from "./NearbyCompareCard";

// 충남 3곳 — 서버가 확정한 가뭄 심한 순(avgRatio 오름차순) 목록. 논산이 우리 지역.
const NEARBY: NearbyResponse = {
  schemaVersion: "1",
  sidoName: "충남",
  asOf: "2025-12-31",
  regions: [
    {
      sigunCode: "44270",
      sigunName: "당진시",
      avgRatio: 71.9,
      stageCode: "ok",
      current: false,
    },
    {
      sigunCode: "44180",
      sigunName: "보령시",
      avgRatio: 48.2,
      stageCode: "alert",
      current: false,
    },
    {
      sigunCode: "44230",
      sigunName: "논산시",
      avgRatio: 112.7,
      stageCode: "ok",
      current: true,
    },
  ],
  stale: true,
  sources: ["커밋 스냅샷(기준 2025-12-31)"],
};

afterEach(() => {
  cleanup();
});

describe("NearbyCompareCard", () => {
  it("시·도 이름 제목과 목록을 서버 순서 그대로 렌더한다", () => {
    render(<NearbyCompareCard data={NEARBY} />);
    expect(screen.getByText("충남 안에서 비교")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => within(li).getByText(/시$/).textContent)).toEqual([
      "당진시",
      "보령시",
      "논산시",
    ]);
  });

  it("우리 지역을 '우리 지역' 마커로 강조한다", () => {
    render(<NearbyCompareCard data={NEARBY} />);
    const marker = screen.getByText("우리 지역");
    const row = marker.closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("논산시")).toBeInTheDocument();
  });

  it("순위 요약을 '넉넉한 순'으로 계산한다(논산 112.7이 1번째)", () => {
    render(<NearbyCompareCard data={NEARBY} />);
    expect(screen.getByText(/충남 3곳 중 물 사정이/)).toBeInTheDocument();
    expect(screen.getByText("1번째")).toBeInTheDocument();
  });

  it("각 지역의 단계 라벨과 평년 대비 저수율을 보여준다", () => {
    render(<NearbyCompareCard data={NEARBY} />);
    expect(screen.getByText("평년 대비 71.9%")).toBeInTheDocument();
    expect(screen.getByText("평년 대비 48.2%")).toBeInTheDocument();
    // 보령은 경계 단계 칩.
    expect(screen.getByText("경계")).toBeInTheDocument();
  });

  it("regions가 비면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <NearbyCompareCard data={{ ...NEARBY, regions: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
