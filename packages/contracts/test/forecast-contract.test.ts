import { describe, expect, expectTypeOf, it } from "vitest";

import forecastOk from "../examples/forecast.ok.json" with { type: "json" };
import forecastStable from "../examples/forecast.stable.json" with { type: "json" };
import type {
  ForecastBandPoint,
  ForecastPoint,
  ForecastResponse,
} from "../src/index.js";

const round2 = (value: number): number => Math.round(value * 100) / 100;

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** data/backtest-report.json residualQuantiles[1..14]의 p10/p90 (채택 모델 naive) */
const RESIDUAL_QUANTILES: ReadonlyArray<readonly [number, number]> = [
  [-0.5, 0.2],
  [-1, 5.17],
  [-1.1, 5.04],
  [-1.2, 4.87],
  [-2, 5.17],
  [-2.3, 6.9],
  [-2.6, 7.2],
  [-2.77, 8.27],
  [-3.3, 8.44],
  [-3.4, 8.51],
  [-3.5, 8.54],
  [-3.9, 8.87],
  [-4.4, 8.67],
  [-4.47, 8.27],
];

const buildHistory = (
  endDate: string,
  endValue: number,
  dailyDelta: number,
  days: number,
): ForecastPoint[] =>
  Array.from({ length: days }, (_, index) => {
    const offset = days - 1 - index;
    return {
      observedOn: addDays(endDate, -offset),
      avgRatio: round2(endValue - dailyDelta * offset),
    };
  });

const buildNaiveForecast = (
  basisDate: string,
  basisValue: number,
): ForecastBandPoint[] =>
  RESIDUAL_QUANTILES.map(([p10, p90], index) => ({
    observedOn: addDays(basisDate, index + 1),
    avgRatio: basisValue,
    low: round2(basisValue + p10),
    high: round2(basisValue + p90),
  }));

/** data/backtest-report.json selectedModel 실측값 */
const backtestedModel = {
  name: "naive",
  version: "pred-v1",
  mae7: 1.9168,
  mae14: 2.8337,
  bandMethod: "residual_quantile_p10_p90",
} as const;

describe("forecast contract fixtures", () => {
  it("keeps the reach fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      sigunCode: "44230",
      sigunName: "논산시",
      basis: {
        observedOn: "2026-07-20",
        avgRatio: 68,
        officialStage: { code: "watch", label: "관심" },
      },
      history: buildHistory("2026-07-20", 68, -0.45, 30),
      forecast: buildNaiveForecast("2026-07-20", 68),
      trend: { dailyDelta: -0.45, bucket: "falling" },
      reach: {
        days: 18,
        bucket: "within_30d",
        targetStage: { code: "care", label: "주의" },
      },
      model: backtestedModel,
      officialOutlook: {
        publishedOn: "2026-07-10",
        current: { code: "watch", label: "관심" },
        outlook1m: { code: "care", label: "주의" },
        outlook2m: { code: "care", label: "주의" },
        outlook3m: { code: "watch", label: "관심" },
      },
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["논가뭄지도", "가뭄예경보자료"],
      stale: false,
    } satisfies ForecastResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<ForecastResponse>();
    expect(forecastOk).toEqual(contractFixture);
  });

  it("keeps the reach example consistent with the documented formula", () => {
    // prediction-model.md 검증 예제: r0=68, d=-0.45, 다음 단계 주의(t=60) → 18일
    expect(forecastOk.reach.days).toBe(Math.ceil((68 - 60) / 0.45));
    expect(forecastOk.reach.days).toBe(18);
    expect(forecastOk.reach.bucket).toBe("within_30d");
    expect(forecastOk.reach.targetStage).toEqual({
      code: "care",
      label: "주의",
    });
    expect(forecastOk.trend.dailyDelta).toBe(-0.45);
    expect(forecastOk.trend.bucket).toBe("falling");
    expect(forecastOk.basis.avgRatio).toBe(68);
  });

  it("keeps model metadata equal to the committed backtest report", () => {
    // data/backtest-report.json selectedModel: naive, mae7 1.9168, mae14 2.8337
    expect(forecastOk.model).toEqual(backtestedModel);
    expect(forecastStable.model).toEqual(backtestedModel);
  });

  it("keeps forecast band points ordered as low <= avgRatio prediction axis", () => {
    expect(forecastOk.history).toHaveLength(30);
    expect(forecastOk.forecast).toHaveLength(14);
    for (const point of forecastOk.forecast) {
      expect(point.low).toBeLessThan(point.high);
    }
  });

  it("keeps the stable fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      sigunCode: "46170",
      sigunName: "나주시",
      basis: {
        observedOn: "2026-07-20",
        avgRatio: 93.5,
        officialStage: { code: "ok", label: "정상" },
      },
      history: buildHistory("2026-07-20", 93.5, 0.32, 30),
      forecast: buildNaiveForecast("2026-07-20", 93.5),
      trend: { dailyDelta: 0.32, bucket: "rising" },
      reach: { days: null, bucket: "none", targetStage: null },
      model: backtestedModel,
      officialOutlook: null,
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["논가뭄지도"],
      stale: false,
    } satisfies ForecastResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<ForecastResponse>();
    expect(forecastStable).toEqual(contractFixture);
  });

  it("keeps the stable example on none bucket without a reach day", () => {
    expect(forecastStable.reach.days).toBeNull();
    expect(forecastStable.reach.bucket).toBe("none");
    expect(forecastStable.reach.targetStage).toBeNull();
    expect(forecastStable.trend.bucket).toBe("rising");
    expect(forecastStable.officialOutlook).toBeNull();
  });

  it("keeps trend and reach bucket unions to the fixed contract values", () => {
    expectTypeOf<ForecastResponse["trend"]["bucket"]>().toEqualTypeOf<
      "rising" | "stable" | "falling"
    >();
    expectTypeOf<ForecastResponse["reach"]["bucket"]>().toEqualTypeOf<
      "none" | "within_7d" | "within_14d" | "within_30d"
    >();
    expectTypeOf<ForecastResponse["model"]["name"]>().toEqualTypeOf<
      "naive" | "ma7" | "linear" | "ses"
    >();
    expectTypeOf<ForecastResponse["model"]["bandMethod"]>().toEqualTypeOf<
      "residual_quantile_p10_p90" | "recent_mae"
    >();
  });
});
