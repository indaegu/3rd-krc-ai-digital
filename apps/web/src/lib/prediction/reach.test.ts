import { describe, expect, it } from "vitest";
import {
  TREND_STABLE_EPSILON,
  daysToNextStage,
  toReachBucket,
  toTrendBucket,
} from "./reach.ts";

describe("daysToNextStage — 다음 단계 도달 가능 시점 (prediction-model.md 산식)", () => {
  it("검증 예제 1: r0=68(관심), d=-0.45 → t=60, ceil(8/0.45)=18", () => {
    expect(daysToNextStage(68, -0.45, "watch")).toBe(18);
  });

  it("검증 예제 2: r0=46(경계), d=-0.67 → t=40, ceil(6/0.67)=9", () => {
    expect(daysToNextStage(46, -0.67, "alert")).toBe(9);
  });

  it("정상 단계는 t=70을 사용한다: r0=75, d=-0.5 → 10", () => {
    expect(daysToNextStage(75, -0.5, "ok")).toBe(10);
  });

  it("주의 단계는 t=50을 사용한다: r0=55, d=-1 → 5", () => {
    expect(daysToNextStage(55, -1, "care")).toBe(5);
  });

  it("d=0(변화 없음)이면 null", () => {
    expect(daysToNextStage(68, 0, "watch")).toBeNull();
  });

  it("상승 추세(d>0)면 null", () => {
    expect(daysToNextStage(68, 0.3, "watch")).toBeNull();
  });

  it("r0가 임계값과 같으면 null (r0 > t 불충족)", () => {
    expect(daysToNextStage(60, -0.5, "watch")).toBeNull();
  });

  it("r0가 임계값 바로 아래여도 null (공식 단계 지연 케이스)", () => {
    expect(daysToNextStage(59.9, -0.5, "watch")).toBeNull();
  });

  it("30일 초과 도달은 null: r0=68, d=-0.1 → ceil(80)=80 > 30", () => {
    expect(daysToNextStage(68, -0.1, "watch")).toBeNull();
  });

  it("정확히 30일이면 30을 반환: r0=63, d=-0.1 → ceil(3/0.1)=30", () => {
    expect(daysToNextStage(63, -0.1, "watch")).toBe(30);
  });

  it("심각 단계면 계산하지 않고 null", () => {
    expect(daysToNextStage(35, -0.5, "crit")).toBeNull();
    expect(daysToNextStage(45, -0.5, "crit")).toBeNull();
  });

  it("결정성: 같은 입력 2회 호출 동일 출력", () => {
    expect(daysToNextStage(68, -0.45, "watch")).toBe(
      daysToNextStage(68, -0.45, "watch"),
    );
  });
});

describe("toReachBucket — days → 버킷 (경계 전부)", () => {
  it.each([
    [null, "none"],
    [1, "within_7d"],
    [7, "within_7d"],
    [8, "within_14d"],
    [14, "within_14d"],
    [15, "within_30d"],
    [30, "within_30d"],
  ] as const)("days %s → %s", (days, bucket) => {
    expect(toReachBucket(days)).toBe(bucket);
  });
});

describe("toTrendBucket — |d| < 0.05 stable, 경계는 방향 유지", () => {
  it("TREND_STABLE_EPSILON은 0.05", () => {
    expect(TREND_STABLE_EPSILON).toBe(0.05);
  });

  it.each([
    [-0.45, "falling"],
    [-0.05, "falling"], // 경계: |d| < ε 불충족 → 방향 유지
    [-0.049, "stable"],
    [0, "stable"],
    [0.049, "stable"],
    [0.05, "rising"], // 경계
    [0.45, "rising"],
  ] as const)("d=%s → %s", (d, bucket) => {
    expect(toTrendBucket(d)).toBe(bucket);
  });
});
