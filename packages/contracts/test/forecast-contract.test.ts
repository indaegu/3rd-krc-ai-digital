import { describe, expect, expectTypeOf, it } from "vitest";

import forecastFloodDemo from "../examples/forecast.flood-demo.json" with { type: "json" };
import forecastNormalDemo from "../examples/forecast.normal-demo.json" with { type: "json" };
import forecastOk from "../examples/forecast.ok.json" with { type: "json" };
import forecastSevereDemo from "../examples/forecast.severe-demo.json" with { type: "json" };
import forecastStable from "../examples/forecast.stable.json" with { type: "json" };
import forecastWatchDemo from "../examples/forecast.watch-demo.json" with { type: "json" };
import statusFloodDemo from "../examples/status.flood-demo.json" with { type: "json" };
import statusNormalDemo from "../examples/status.normal-demo.json" with { type: "json" };
import statusSevereDemo from "../examples/status.severe-demo.json" with { type: "json" };
import statusWatchDemo from "../examples/status.watch-demo.json" with { type: "json" };
import type {
  ForecastBandPoint,
  ForecastPoint,
  ForecastResponse,
  StatusResponse,
} from "../src/index.js";

const round2 = (value: number): number => Math.round(value * 100) / 100;

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** data/backtest-report.json residualQuantiles[1..14]의 p25/p75 (채택 모델 naive) */
const RESIDUAL_QUANTILES: ReadonlyArray<readonly [number, number]> = [
  [-0.2, 0],
  [-0.4, 0.3],
  [-0.5, 0.2],
  [-0.6, 0.2],
  [-0.8, 0.6],
  [-0.9, 0.7],
  [-1, 0.7],
  [-1.1, 0.9],
  [-1.3, 0.9],
  [-1.4, 0.9],
  [-1.425, 0.9],
  [-1.6, 1.1],
  [-1.8, 1.2],
  [-2, 1.2],
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
  RESIDUAL_QUANTILES.map(([p25, p75], index) => ({
    observedOn: addDays(basisDate, index + 1),
    avgRatio: basisValue,
    low: round2(basisValue + p25),
    high: round2(basisValue + p75),
  }));

/** data/backtest-report.json selectedModel 실측값 */
const backtestedModel = {
  name: "naive",
  version: "pred-v1",
  mae7: 1.9168,
  mae14: 2.8337,
  bandMethod: "residual_quantile_p25_p75_regional",
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
        // 대상 월은 서버가 확정한다 — 화면이 "1개월 뒤"라고 쓰지 않게 한다(v1 additive).
        targetMonths: ["2026-08", "2026-09", "2026-10"],
        monthsSincePublished: 0,
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
});

// 4개 상태 데모 픽스처 — product.md 상태 표와 산술 정합:
// reach.days === ceil((avgRatio − 다음 단계 임계값) / |dailyDelta|).
// 임계값은 공인 기준 70/60/50/40이며 프로덕션 코드는 drought-stage.ts가 단일 출처다
// (여기서는 계약 패키지 테스트라 산술 검증용 수치로만 쓴다).
describe("forecast demo fixtures — 도달일·단계 산술 정합", () => {
  type Demo = {
    name: string;
    forecast: ForecastResponse;
    status: StatusResponse;
    dailyDelta: number;
    trendBucket: ForecastResponse["trend"]["bucket"];
    reach: {
      days: number;
      bucket: ForecastResponse["reach"]["bucket"];
      targetStage: { code: string; label: string };
      threshold: number;
    } | null;
  };

  const DEMOS: readonly Demo[] = [
    {
      name: "정상(−0.12 → none)",
      forecast: forecastNormalDemo as ForecastResponse,
      status: statusNormalDemo as StatusResponse,
      dailyDelta: -0.12,
      trendBucket: "falling",
      reach: null,
    },
    {
      name: "가뭄 진행(−0.45 → 18일 주의)",
      forecast: forecastWatchDemo as ForecastResponse,
      status: statusWatchDemo as StatusResponse,
      dailyDelta: -0.45,
      trendBucket: "falling",
      reach: {
        days: 18,
        bucket: "within_30d",
        targetStage: { code: "care", label: "주의" },
        threshold: 60,
      },
    },
    {
      name: "심각 임박(−0.67 → 9일 심각)",
      forecast: forecastSevereDemo as ForecastResponse,
      status: statusSevereDemo as StatusResponse,
      dailyDelta: -0.67,
      trendBucket: "falling",
      reach: {
        days: 9,
        bucket: "within_14d",
        targetStage: { code: "crit", label: "심각" },
        threshold: 40,
      },
    },
    {
      name: "장마 만수위(+0.42 → none)",
      forecast: forecastFloodDemo as ForecastResponse,
      status: statusFloodDemo as StatusResponse,
      dailyDelta: 0.42,
      trendBucket: "rising",
      reach: null,
    },
  ];

  for (const demo of DEMOS) {
    it(`${demo.name}: 추세·도달일이 산식과 일치한다`, () => {
      const { forecast } = demo;
      expect(forecast.trend.dailyDelta).toBe(demo.dailyDelta);
      expect(forecast.trend.bucket).toBe(demo.trendBucket);

      if (demo.reach === null) {
        expect(forecast.reach.days).toBeNull();
        expect(forecast.reach.bucket).toBe("none");
        expect(forecast.reach.targetStage).toBeNull();
      } else {
        // reach.days === ceil((avgRatio − 임계값) / |dailyDelta|)
        expect(forecast.reach.days).toBe(
          Math.ceil(
            (forecast.basis.avgRatio - demo.reach.threshold) /
              Math.abs(demo.dailyDelta),
          ),
        );
        expect(forecast.reach.days).toBe(demo.reach.days);
        expect(forecast.reach.bucket).toBe(demo.reach.bucket);
        expect(forecast.reach.targetStage).toEqual(demo.reach.targetStage);
      }
    });

    it(`${demo.name}: history 30점이 dailyDelta 등차로 basis에 도달한다`, () => {
      const { forecast } = demo;
      expect(forecast.history).toHaveLength(30);
      expect(forecast.forecast).toHaveLength(14);
      const last = forecast.history[forecast.history.length - 1];
      expect(last?.observedOn).toBe(forecast.basis.observedOn);
      expect(last?.avgRatio).toBe(forecast.basis.avgRatio);
      for (let i = 1; i < forecast.history.length; i += 1) {
        const prev = forecast.history[i - 1];
        const next = forecast.history[i];
        if (prev === undefined || next === undefined) {
          throw new Error("history 점이 비었다");
        }
        expect(round2(next.avgRatio - prev.avgRatio)).toBe(demo.dailyDelta);
      }
      for (const point of forecast.forecast) {
        expect(point.low).toBeLessThan(point.high);
      }
    });

    it(`${demo.name}: status 데모와 지역·수치·단계가 일치한다`, () => {
      expect(demo.forecast.sigunCode).toBe(demo.status.sigunCode);
      expect(demo.forecast.sigunName).toBe(demo.status.sigunName);
      expect(demo.forecast.basis.avgRatio).toBe(demo.status.region.avgRatio);
      expect(demo.forecast.basis.officialStage).toEqual(
        demo.status.region.officialStage,
      );
      expect(demo.forecast.model).toEqual(backtestedModel);
    });
  }
});

describe("forecast contract stageGuide", () => {
  it("keeps stageGuide optional — the absent fixture stays valid", () => {
    // stageGuide는 선택 필드다: 없는 페이로드도 여전히 ForecastResponse다.
    const withoutGuide = forecastOk as ForecastResponse;
    expect("stageGuide" in withoutGuide).toBe(false);
    expect(withoutGuide.stageGuide).toBeUndefined();
    expectTypeOf<ForecastResponse["stageGuide"]>().toEqualTypeOf<
      NonNullable<ForecastResponse["stageGuide"]> | undefined
    >();
  });

  it("accepts a 5-entry ok→crit guide with exactly one current stage", () => {
    const guide: NonNullable<ForecastResponse["stageGuide"]> = [
      { code: "ok", label: "정상", actions: ["a1", "a2", "a3"], current: true },
      { code: "watch", label: "관심", actions: ["a1"], current: false },
      { code: "care", label: "주의", actions: ["a1"], current: false },
      { code: "alert", label: "경계", actions: ["a1"], current: false },
      { code: "crit", label: "심각", actions: ["a1"], current: false },
    ];
    const withGuide: ForecastResponse = {
      ...(forecastOk as ForecastResponse),
      stageGuide: guide,
    };

    expectTypeOf(withGuide).toMatchTypeOf<ForecastResponse>();
    expect(withGuide.stageGuide).toHaveLength(5);
    expect(withGuide.stageGuide?.map((s) => s.code)).toEqual([
      "ok",
      "watch",
      "care",
      "alert",
      "crit",
    ]);
    expect(withGuide.stageGuide?.filter((s) => s.current)).toHaveLength(1);
    for (const entry of withGuide.stageGuide ?? []) {
      expect(entry.actions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("constrains stageGuide code to the drought-stage enum", () => {
    expectTypeOf<
      NonNullable<ForecastResponse["stageGuide"]>[number]["code"]
    >().toEqualTypeOf<"ok" | "watch" | "care" | "alert" | "crit">();
    expectTypeOf<
      NonNullable<ForecastResponse["stageGuide"]>[number]["current"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      NonNullable<ForecastResponse["stageGuide"]>[number]["actions"]
    >().toEqualTypeOf<string[]>();
  });
});

describe("forecast contract type unions", () => {
  it("keeps trend and reach bucket unions to the fixed contract values", () => {
    expectTypeOf<ForecastResponse["trend"]["bucket"]>().toEqualTypeOf<
      "rising" | "stable" | "falling"
    >();
    expectTypeOf<ForecastResponse["reach"]["bucket"]>().toEqualTypeOf<
      "none" | "within_7d" | "within_14d" | "within_30d"
    >();
    // damped는 2026-07-26 재검증에서 후보로 추가한 감쇠 추세 모델이다(채택은 여전히 naive).
    expectTypeOf<ForecastResponse["model"]["name"]>().toEqualTypeOf<
      "naive" | "ma7" | "linear" | "ses" | "damped"
    >();
    expectTypeOf<ForecastResponse["model"]["bandMethod"]>().toEqualTypeOf<
      | "residual_quantile_p25_p75_regional"
      | "residual_quantile_p10_p90"
      | "recent_mae"
    >();
  });
});
