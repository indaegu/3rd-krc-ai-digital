// 백테스트 엔진 단위 테스트 — 합성 픽스처만 사용한다(CI에서 원CSV 없이 통과).
// 프로토콜(origin 규칙·누수 차단·MAE·선택 규칙·제외 사유)은 docs/prediction-model.md가 SSOT다.
import { describe, expect, it } from "vitest";
import {
  MAX_GAP_DAYS,
  MIN_VALID_DAYS,
  ORIGIN_STEP_DAYS,
  ORIGIN_WINDOW_DAYS,
  TIE_BREAK_EPSILON_PP,
  addDaysIso,
  daysBetweenIso,
  generateOriginDates,
  runBacktest,
  splitAtOrigin,
  type BacktestPoint,
} from "./backtest.ts";
import { backtestReportSchema } from "./backtest-report.ts";

const START = "2025-01-01";

/** START부터 days일 연속 시계열. skip(i)=true인 날은 결측으로 뺀다. */
function buildSeries(
  days: number,
  valueAt: (i: number) => number,
  skip?: (i: number) => boolean,
): BacktestPoint[] {
  const points: BacktestPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    if (skip?.(i) === true) continue;
    points.push({ observedOn: addDaysIso(START, i), avgRatio: valueAt(i) });
  }
  return points;
}

/** 완전 선형 하강: 95에서 하루 -0.1%p씩 200일. */
const LINEAR_REGION = buildSeries(200, (i) => 95 - 0.1 * i);

/** 상수 지역: 200일 내내 55. 4개 모델 전부 오차 0 → 완전 동률. */
const CONSTANT_REGION = buildSeries(200, () => 55);

/** 결정적 의사 노이즈 지역(랜덤 금지 — sin 사용). */
const NOISE_REGION = buildSeries(200, (i) => 70 + 3 * Math.sin(i / 3));

/** 완만한 하강(-0.006%p/day): naive 14일 MAE=0.045 ≤ 0.05 → 근사 동률. */
const NEAR_TIE_REGION = buildSeries(200, (i) => 80 - 0.006 * i);

/** 179일 — MIN_VALID_DAYS(180) 미달 제외 대상. */
const SHORT_REGION = buildSeries(179, () => 65);

/** 8일 연속 결측(100..107일차) — MAX_GAP_DAYS(7) 초과 제외 대상. */
const GAP_REGION = buildSeries(
  200,
  (i) => 60 - 0.05 * i,
  (i) => i >= 100 && i <= 107,
);

describe("파라미터 상수 (플랜 확정값)", () => {
  it("프로토콜 상수가 플랜 값과 일치한다", () => {
    expect(MIN_VALID_DAYS).toBe(180);
    expect(MAX_GAP_DAYS).toBe(7);
    expect(ORIGIN_WINDOW_DAYS).toBe(90);
    expect(ORIGIN_STEP_DAYS).toBe(14);
    expect(TIE_BREAK_EPSILON_PP).toBe(0.05);
  });
});

describe("generateOriginDates — 마지막 90일 안 14일 간격", () => {
  it("2025-12-31 기준 origin 6개를 오름차순으로 만든다", () => {
    expect(generateOriginDates("2025-12-31")).toEqual([
      "2025-10-08",
      "2025-10-22",
      "2025-11-05",
      "2025-11-19",
      "2025-12-03",
      "2025-12-17",
    ]);
  });

  it("모든 origin이 마지막 90일 안이고 간격은 14일, 마지막 origin은 lastDate-14", () => {
    const last = "2025-07-19";
    const origins = generateOriginDates(last);
    expect(origins).toHaveLength(6);
    for (const origin of origins) {
      expect(daysBetweenIso(origin, last)).toBeLessThanOrEqual(
        ORIGIN_WINDOW_DAYS,
      );
      // 14일 평가 구간이 lastDate를 넘지 않는다.
      expect(daysBetweenIso(origin, last)).toBeGreaterThanOrEqual(14);
    }
    for (let i = 1; i < origins.length; i += 1) {
      const prev = origins[i - 1];
      const next = origins[i];
      if (prev === undefined || next === undefined) throw new Error("origin");
      expect(daysBetweenIso(prev, next)).toBe(ORIGIN_STEP_DAYS);
    }
    expect(origins[origins.length - 1]).toBe(addDaysIso(last, -14));
  });
});

describe("splitAtOrigin — 데이터 누수 차단", () => {
  it("학습 창에 origin 이후 값이 없고, 평가 창은 (origin, origin+14]다", () => {
    const last = LINEAR_REGION[LINEAR_REGION.length - 1]?.observedOn ?? "";
    for (const origin of generateOriginDates(last)) {
      const { train, test } = splitAtOrigin(LINEAR_REGION, origin);
      for (const point of train) {
        expect(point.observedOn <= origin).toBe(true);
      }
      for (const point of test) {
        expect(point.observedOn > origin).toBe(true);
        expect(point.horizon).toBe(daysBetweenIso(origin, point.observedOn));
        expect(point.horizon).toBeGreaterThanOrEqual(1);
        expect(point.horizon).toBeLessThanOrEqual(14);
      }
      // 결측 없는 픽스처에서는 학습+평가가 원본을 정확히 분할한다.
      expect(train.length + test.length).toBe(
        LINEAR_REGION.filter((p) => p.observedOn <= addDaysIso(origin, 14))
          .length,
      );
    }
  });
});

describe("runBacktest — 완전 선형 지역", () => {
  const core = runBacktest({ "10001": LINEAR_REGION });

  it("origin 6개·표본 84개(6×14)를 평가한다", () => {
    expect(core.regionCount).toBe(1);
    expect(core.originCount).toBe(6);
    expect(core.sampleCount).toBe(84);
    expect(core.excluded).toEqual([]);
  });

  it("linear MAE ≈ 0, naive MAE는 기울기 손계산값(7일 0.4, 14일 0.75)", () => {
    expect(core.models.linear.macro.mae14).toBeCloseTo(0, 4);
    expect(core.models.linear.macro.mae7).toBeCloseTo(0, 4);
    expect(core.models.naive.macro.mae7).toBeCloseTo(0.4, 4);
    expect(core.models.naive.macro.mae14).toBeCloseTo(0.75, 4);
    expect(core.models.naive.byRegion["10001"]?.mae14).toBeCloseTo(0.75, 4);
    expect(core.models.naive.byRegion["10001"]?.originCount).toBe(6);
  });

  it("14일 macro MAE 최저인 linear를 동률 없이 채택한다", () => {
    expect(core.selectedModel.name).toBe("linear");
    expect(core.selectedModel.rule).toBe("lowest_mae14");
    expect(core.selectedModel.tiedWith).toEqual([]);
  });

  it("채택 모델의 horizon 1..14 잔차 p10/p90 ≈ 0", () => {
    expect(core.residualQuantiles).toHaveLength(14);
    core.residualQuantiles.forEach((entry, index) => {
      expect(entry.horizon).toBe(index + 1);
      expect(entry.count).toBe(6);
      expect(entry.p10).toBeCloseTo(0, 4);
      expect(entry.p90).toBeCloseTo(0, 4);
    });
  });
});

describe("runBacktest — 제외 규칙", () => {
  const core = runBacktest({
    "10001": LINEAR_REGION,
    "10002": CONSTANT_REGION,
    "10003": NOISE_REGION,
    "10009": SHORT_REGION,
    "10010": GAP_REGION,
  });

  it("179일 지역은 insufficient_days, 8일 갭 지역은 long_gap으로 제외한다", () => {
    expect(core.excluded).toEqual([
      { sigunCode: "10009", reason: "insufficient_days" },
      { sigunCode: "10010", reason: "long_gap" },
    ]);
    expect(core.regionCount).toBe(3);
  });

  it("제외 지역은 지역별 지표에 나타나지 않는다", () => {
    expect(Object.keys(core.models.naive.byRegion).sort()).toEqual([
      "10001",
      "10002",
      "10003",
    ]);
  });
});

describe("runBacktest — 동률 시 단순성 서열(naive < ma7 < ses < linear)", () => {
  it("상수 지역(전 모델 MAE 0)이면 가장 단순한 naive를 고른다", () => {
    const core = runBacktest({ "10002": CONSTANT_REGION });
    expect(core.selectedModel.name).toBe("naive");
    expect(core.selectedModel.rule).toBe("simplicity_tiebreak");
    expect(core.selectedModel.tiedWith).toEqual(["ma7", "ses", "linear"]);
  });

  it("차이 ≤ 0.05%p 근사 동률에서도 단순성 서열로 고른다", () => {
    const core = runBacktest({ "10004": NEAR_TIE_REGION });
    // naive 14일 MAE = 7.5 × 0.006 = 0.045 ≤ 0.05 → linear(≈0)와 동률.
    expect(core.models.naive.macro.mae14).toBeCloseTo(0.045, 4);
    expect(core.selectedModel.name).toBe("naive");
    expect(core.selectedModel.rule).toBe("simplicity_tiebreak");
    expect(core.selectedModel.tiedWith).toContain("linear");
  });
});

describe("runBacktest — 결정성", () => {
  it("같은 입력 2회 실행은 바이트 동일 결과를 낸다", () => {
    const input = {
      "10001": LINEAR_REGION,
      "10002": CONSTANT_REGION,
      "10003": NOISE_REGION,
    };
    expect(JSON.stringify(runBacktest(input))).toBe(
      JSON.stringify(runBacktest(input)),
    );
  });
});

describe("backtest-report Zod 스키마", () => {
  it("엔진 코어 + CLI 주입 필드(runAt/gitCommit/체크섬)가 스키마를 통과한다", () => {
    const core = runBacktest({
      "10001": LINEAR_REGION,
      "10003": NOISE_REGION,
    });
    const report = {
      ...core,
      sourceFile: "한국농어촌공사_논가뭄지도_20251231.csv",
      sourceChecksum: "a".repeat(64),
      runAt: "2026-07-22T00:00:00.000Z",
      gitCommit: "b".repeat(40),
    };
    expect(() => backtestReportSchema.parse(report)).not.toThrow();
  });
});
