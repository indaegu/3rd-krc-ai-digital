import { describe, expect, it } from "vitest";
import { HIGH_WATER_RATE_THRESHOLD, isHighWaterNotice } from "./high-water.ts";

describe("isHighWaterNotice — 원저수율 rate>=95 이고 상승 추세일 때만", () => {
  it("임계값 상수는 95", () => {
    expect(HIGH_WATER_RATE_THRESHOLD).toBe(95);
  });

  it("만수위 경계 95.0 + 상승 → true", () => {
    expect(isHighWaterNotice([94.5, 95.0])).toBe(true);
  });

  it("96 + 상승 → true", () => {
    expect(isHighWaterNotice([93, 94, 96])).toBe(true);
  });

  it("95 이상이어도 하락 추세면 false", () => {
    expect(isHighWaterNotice([96, 95])).toBe(false);
    expect(isHighWaterNotice([97, 96.5, 96])).toBe(false);
  });

  it("95 이상이어도 보합(직전과 동일)이면 false", () => {
    expect(isHighWaterNotice([95, 95])).toBe(false);
  });

  it("94.9는 상승 중이어도 false (임계값 미달)", () => {
    expect(isHighWaterNotice([94, 94.9])).toBe(false);
  });

  it("관측 1개 이하로는 추세를 알 수 없어 false", () => {
    expect(isHighWaterNotice([])).toBe(false);
    expect(isHighWaterNotice([96])).toBe(false);
  });

  it("결정성: 같은 입력 2회 호출 동일 출력", () => {
    const series = [94, 96];
    expect(isHighWaterNotice(series)).toBe(isHighWaterNotice(series));
  });
});
