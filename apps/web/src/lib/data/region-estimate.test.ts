// 지역 평년 대비 추정 순수 함수 검증 — 산식·게이트·폴백 조건.

import { describe, expect, it } from "vitest";

import {
  MIN_CAPACITY_RATIO,
  estimateFromObservations,
  estimateRegionAvgRatio,
  isEstimatableRegion,
  normalRateFor,
} from "./region-estimate.ts";

import estimatorReport from "../../../../../data/snapshots/region-estimator.json" with { type: "json" };

const REGIONS = estimatorReport.regions as Record<
  string,
  { usable: boolean; factor: number }
>;

/** 산출물에서 게이트를 통과한 시군 하나를 고른다(하드코딩 대신 실제 값 사용). */
const usableCode =
  Object.entries(REGIONS).find(([, model]) => model.usable)?.[0] ?? "";
/** 게이트를 통과하지 못한 시군(폴백 대상). */
const blockedCode =
  Object.entries(REGIONS).find(([, model]) => !model.usable)?.[0] ?? "";

describe("추정 대상 판정", () => {
  it("게이트를 통과한 시군만 추정 대상이다", () => {
    expect(usableCode).not.toBe("");
    expect(isEstimatableRegion(usableCode)).toBe(true);
  });

  it("게이트를 통과하지 못한 시군은 추정하지 않는다", () => {
    expect(blockedCode).not.toBe("");
    expect(isEstimatableRegion(blockedCode)).toBe(false);
  });

  it("모르는 시군 코드는 추정하지 않는다", () => {
    expect(isEstimatableRegion("00000")).toBe(false);
  });
});

describe("평년값 조회", () => {
  it("월-일로 공표 평년값을 찾는다", () => {
    expect(normalRateFor(usableCode, "2026-07-26")).toBeGreaterThan(0);
  });

  it("모르는 시군은 null", () => {
    expect(normalRateFor("00000", "2026-07-26")).toBeNull();
  });
});

describe("추정 산식", () => {
  const reservoirs = [
    { facCode: "A", effectiveStorage: 100 },
    { facCode: "B", effectiveStorage: 300 },
  ];

  it("유효저수량 가중 평균으로 통합저수율을 만든다", () => {
    const normal = normalRateFor(usableCode, "2026-07-26");
    expect(normal).not.toBeNull();
    const factor = REGIONS[usableCode]?.factor ?? 1;

    const result = estimateRegionAvgRatio({
      sigunCode: usableCode,
      observedOn: "2026-07-26",
      reservoirs,
      // 가중 평균 = (50×100 + 90×300) / 400 = 80
      ratesByFacCode: new Map([
        ["A", 50],
        ["B", 90],
      ]),
    });

    expect(result).not.toBeNull();
    expect(result?.regionalRate).toBeCloseTo(
      Math.round(80 * factor * 10) / 10,
      1,
    );
    expect(result?.avgRatio).toBeCloseTo(
      Math.round(((80 * factor) / (normal ?? 1)) * 1000) / 10,
      1,
    );
    expect(result?.reservoirCount).toBe(2);
    expect(result?.capacityRatio).toBe(1);
  });

  it("관측이 용량의 일부만 덮으면 추정하지 않는다(편향 방지)", () => {
    // A만 관측 → 용량 비중 100/400 = 0.25 < 게이트
    expect(MIN_CAPACITY_RATIO).toBeGreaterThan(0.25);
    const result = estimateRegionAvgRatio({
      sigunCode: usableCode,
      observedOn: "2026-07-26",
      reservoirs,
      ratesByFacCode: new Map([["A", 50]]),
    });
    expect(result).toBeNull();
  });

  it("게이트 미통과 시군은 관측이 충분해도 추정하지 않는다", () => {
    const result = estimateRegionAvgRatio({
      sigunCode: blockedCode,
      observedOn: "2026-07-26",
      reservoirs,
      ratesByFacCode: new Map([
        ["A", 50],
        ["B", 90],
      ]),
    });
    expect(result).toBeNull();
  });

  it("관측이 하나도 없으면 추정하지 않는다", () => {
    const result = estimateRegionAvgRatio({
      sigunCode: usableCode,
      observedOn: "2026-07-26",
      reservoirs,
      ratesByFacCode: new Map(),
    });
    expect(result).toBeNull();
  });
});

describe("관측 묶음에서 날짜 고르기", () => {
  const reservoirs = [
    { facCode: "A", effectiveStorage: 100 },
    { facCode: "B", effectiveStorage: 300 },
  ];

  it("커버리지를 채우는 가장 최근 날짜를 쓴다", () => {
    const result = estimateFromObservations({
      sigunCode: usableCode,
      reservoirs,
      observations: [
        // 최신일(7-26)은 A만 올라와 커버리지 미달 → 7-25로 물러난다.
        { facCode: "A", observedOn: "2026-07-26", rate: 40 },
        { facCode: "A", observedOn: "2026-07-25", rate: 50 },
        { facCode: "B", observedOn: "2026-07-25", rate: 90 },
      ],
    });
    expect(result?.observedOn).toBe("2026-07-25");
    expect(result?.reservoirCount).toBe(2);
  });

  it("rate가 없는 관측은 무시한다", () => {
    const result = estimateFromObservations({
      sigunCode: usableCode,
      reservoirs,
      observations: [
        { facCode: "A", observedOn: "2026-07-26", rate: null },
        { facCode: "B", observedOn: "2026-07-26", rate: null },
        { facCode: "A", observedOn: "2026-07-25", rate: 50 },
        { facCode: "B", observedOn: "2026-07-25", rate: 90 },
      ],
    });
    expect(result?.observedOn).toBe("2026-07-25");
  });

  it("어느 날짜도 커버리지를 못 채우면 null", () => {
    const result = estimateFromObservations({
      sigunCode: usableCode,
      reservoirs,
      observations: [
        { facCode: "A", observedOn: "2026-07-26", rate: 40 },
        { facCode: "A", observedOn: "2026-07-25", rate: 50 },
      ],
    });
    expect(result).toBeNull();
  });
});
