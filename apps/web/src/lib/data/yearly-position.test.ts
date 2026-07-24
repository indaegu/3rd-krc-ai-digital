// 올해 흐름 속 현재 위치 순수 엔진 테스트 — 결정적 입력으로 분위수·백분위·버킷을 강제한다.
import { describe, expect, it } from "vitest";
import {
  bucketOf,
  buildYearlyPosition,
  percentileOf,
  YEARLY_MIN_COUNT,
  yearlyPositionSchema,
} from "./yearly-position";

/** 0..100 정수 40개 — decile 경계가 예측 가능한 균등 분포. */
const UNIFORM_0_TO_100 = Array.from({ length: 41 }, (_, i) => i * 2.5);

describe("buildYearlyPosition", () => {
  it("지역별 11개 decile 경계를 오름차순·소수 2자리로 만든다", () => {
    const snapshot = buildYearlyPosition({ "44230": UNIFORM_0_TO_100 });
    const entry = snapshot["44230"];
    expect(entry).toBeDefined();
    if (entry === undefined) throw new Error("entry 존재");
    expect(entry.year).toBe(2025);
    expect(entry.count).toBe(41);
    expect(entry.breakpoints).toHaveLength(11);
    // 균등 [0,100] 분포의 decile 경계 = 0,10,20,…,90,100.
    expect(entry.breakpoints).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
    ]);
    // 오름차순 보장.
    for (let i = 1; i < entry.breakpoints.length; i += 1) {
      expect(entry.breakpoints[i]).toBeGreaterThanOrEqual(
        entry.breakpoints[i - 1] ?? 0,
      );
    }
  });

  it(`관측이 ${YEARLY_MIN_COUNT}개 미만인 지역은 제외한다`, () => {
    const few = Array.from({ length: YEARLY_MIN_COUNT - 1 }, () => 50);
    const enough = Array.from({ length: YEARLY_MIN_COUNT }, (_, i) => i);
    const snapshot = buildYearlyPosition({ few, enough });
    expect(snapshot["few"]).toBeUndefined();
    expect(snapshot["enough"]).toBeDefined();
  });

  it("breakpoints를 소수 2자리로 반올림한다", () => {
    const values = Array.from({ length: 30 }, (_, i) => i / 3); // 0, 0.333, …
    const snapshot = buildYearlyPosition({ r: values });
    const entry = snapshot["r"];
    if (entry === undefined) throw new Error("entry 존재");
    for (const bp of entry.breakpoints) {
      expect(Math.round(bp * 100) / 100).toBe(bp);
    }
  });

  it("스키마 검증을 통과한다", () => {
    const snapshot = buildYearlyPosition({ "44230": UNIFORM_0_TO_100 });
    expect(() => yearlyPositionSchema.parse(snapshot)).not.toThrow();
  });
});

describe("percentileOf", () => {
  const breakpoints = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it("min 이하는 0, max 이상은 100으로 클램프한다", () => {
    expect(percentileOf(breakpoints, -5)).toBe(0);
    expect(percentileOf(breakpoints, 0)).toBe(0);
    expect(percentileOf(breakpoints, 100)).toBe(100);
    expect(percentileOf(breakpoints, 140)).toBe(100);
  });

  it("경계값에서 해당 백분위를 낸다", () => {
    expect(percentileOf(breakpoints, 10)).toBe(10);
    expect(percentileOf(breakpoints, 50)).toBe(50);
    expect(percentileOf(breakpoints, 90)).toBe(90);
  });

  it("구간 안에서 선형 보간하고 정수로 반올림한다", () => {
    // 15는 10..20 구간의 중간 → 백분위 15.
    expect(percentileOf(breakpoints, 15)).toBe(15);
    // 33은 30..40 구간의 30% → 33.
    expect(percentileOf(breakpoints, 33)).toBe(33);
  });

  it("실제 스냅샷 표본과 일치한다(논산 44230)", () => {
    // build:yearly로 커밋된 값. avgRatio 93.5 → 하위 10%.
    const nonsan = [
      71.4, 94.04, 96.6, 103.62, 109.34, 111.5, 112.44, 113.68, 115.2, 121.48,
      141.8,
    ];
    const p = percentileOf(nonsan, 93.5);
    expect(p).toBe(10);
    expect(bucketOf(p)).toBe("low");
  });

  it("동일 경계(구간 폭 0)에서도 예외 없이 백분위를 낸다", () => {
    const flat = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 20];
    // value 10은 min이므로 0.
    expect(percentileOf(flat, 10)).toBe(0);
    // value 15는 90..100 구간(10→20)에서 90 + 50% = 95.
    expect(percentileOf(flat, 15)).toBe(95);
  });
});

describe("bucketOf", () => {
  it("33.3 미만은 low, 66.7 미만은 mid, 그 이상은 high", () => {
    expect(bucketOf(0)).toBe("low");
    expect(bucketOf(33)).toBe("low");
    expect(bucketOf(34)).toBe("mid");
    expect(bucketOf(66)).toBe("mid");
    expect(bucketOf(67)).toBe("high");
    expect(bucketOf(100)).toBe("high");
  });
});
