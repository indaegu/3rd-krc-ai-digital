import { describe, expect, it } from "vitest";
import {
  FORECAST_HORIZON_DAYS,
  LINEAR_WINDOW_DAYS,
  MODEL_MIN_INPUT_DAYS,
  MODEL_SIMPLICITY_ORDER,
  MODEL_VERSION,
  OBSERVED_TREND_WINDOW_DAYS,
  PREDICTION_MODEL_NAMES,
  SES_ALPHA,
  dailyDelta,
  observedDailyDelta,
  predict,
} from "./models.ts";

/** 14일 미만이면 모든 모델이 에러(플랜 인터페이스 계약). */
const SHORT_SERIES = Array.from({ length: 13 }, () => 65);

/** 완전 선형 하강: 90에서 하루 -0.5씩 14일. */
const LINEAR_SERIES = Array.from({ length: 14 }, (_, i) => 90 - 0.5 * i);

/** 마지막 7일이 70..76인 14일 시계열(ma7 손계산 = 73). */
const MA7_SERIES = [60, 60, 60, 60, 60, 60, 60, 70, 71, 72, 73, 74, 75, 76];

/** 13일 50 유지 후 마지막 날 60 — ses(alpha=0.3) 손계산 = 0.3*60 + 0.7*50 = 53. */
const SES_SERIES = [...Array.from({ length: 13 }, () => 50), 60];

describe("모델 상수 (플랜 확정값)", () => {
  it("이름 있는 상수와 버전이 플랜 값과 일치한다", () => {
    expect(FORECAST_HORIZON_DAYS).toBe(14);
    expect(LINEAR_WINDOW_DAYS).toBe(14);
    expect(SES_ALPHA).toBe(0.3);
    expect(MODEL_VERSION).toBe("pred-v1");
  });

  it("단순성 서열은 naive < ma7 < ses < linear", () => {
    expect(MODEL_SIMPLICITY_ORDER).toEqual(["naive", "ma7", "ses", "linear"]);
  });

  it("모델 4종 전부 최소 입력 길이 상수를 갖는다", () => {
    for (const model of PREDICTION_MODEL_NAMES) {
      expect(MODEL_MIN_INPUT_DAYS[model]).toBeGreaterThanOrEqual(14);
    }
  });
});

describe("predict — 공통 계약", () => {
  it.each(["naive", "ma7", "linear", "ses"] as const)(
    "%s: 14일 미만 입력이면 명시적 에러",
    (model) => {
      expect(() => predict(model, SHORT_SERIES)).toThrow(/14/);
    },
  );

  it.each(["naive", "ma7", "linear", "ses"] as const)(
    "%s: 출력은 항상 14개",
    (model) => {
      expect(predict(model, LINEAR_SERIES)).toHaveLength(14);
    },
  );

  it.each(["naive", "ma7", "linear", "ses"] as const)(
    "%s: 상수 시계열이면 상수 예측",
    (model) => {
      const constant = Array.from({ length: 14 }, () => 62.5);
      for (const value of predict(model, constant)) {
        expect(value).toBeCloseTo(62.5, 10);
      }
    },
  );

  it.each(["naive", "ma7", "linear", "ses"] as const)(
    "%s: 같은 입력 2회 호출은 동일 출력(결정성)",
    (model) => {
      expect(predict(model, LINEAR_SERIES)).toEqual(
        predict(model, LINEAR_SERIES),
      );
    },
  );
});

describe("naive — 마지막 값 유지", () => {
  it("마지막 값 63.2를 14일 유지한다", () => {
    const series = [70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 61, 62, 63.2];
    expect(predict("naive", series)).toEqual(
      Array.from({ length: 14 }, () => 63.2),
    );
  });
});

describe("ma7 — 최근 7일 평균 유지", () => {
  it("마지막 7일 70..76의 평균 73을 유지한다", () => {
    for (const value of predict("ma7", MA7_SERIES)) {
      expect(value).toBeCloseTo(73, 10);
    }
  });
});

describe("linear — 최근 14일 선형회귀 외삽", () => {
  it("완전 선형 입력(기울기 -0.5)을 정확히 외삽한다", () => {
    const forecast = predict("linear", LINEAR_SERIES);
    forecast.forEach((value, i) => {
      // 마지막 실측 83.5에서 h=i+1일 뒤: 83.5 - 0.5*(i+1)
      expect(value).toBeCloseTo(83.5 - 0.5 * (i + 1), 10);
    });
  });
});

describe("ses — 단순 지수평활(alpha=0.3)", () => {
  it("13일 50 유지 후 60이면 수준은 53", () => {
    for (const value of predict("ses", SES_SERIES)) {
      expect(value).toBeCloseTo(53, 10);
    }
  });
});

describe("dailyDelta — d = (forecast[13] - r0) / 14", () => {
  it("naive는 자연히 0", () => {
    const series = [70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 61, 62, 63.2];
    expect(dailyDelta(63.2, predict("naive", series))).toBe(0);
  });

  it("linear 완전 선형 하강(-0.5/day)이면 d = -0.5", () => {
    // r0 = 83.5, forecast[13] = 83.5 - 0.5*14 = 76.5 → (76.5-83.5)/14 = -0.5
    expect(dailyDelta(83.5, predict("linear", LINEAR_SERIES))).toBeCloseTo(
      -0.5,
      10,
    );
  });

  it("ma7는 (평균 - 마지막 값)/14 — r0=76, 평균 73 → -3/14", () => {
    expect(dailyDelta(76, predict("ma7", MA7_SERIES))).toBeCloseTo(-3 / 14, 10);
  });

  it("예측이 14개가 아니면 명시적 에러", () => {
    expect(() => dailyDelta(70, [70, 70, 70])).toThrow(/14/);
  });
});

describe("observedDailyDelta — 최근 14일 관측 OLS 기울기 (2026-07-22 확정)", () => {
  it("창 상수는 14일이다", () => {
    expect(OBSERVED_TREND_WINDOW_DAYS).toBe(14);
  });

  it("완전 선형 하강 -0.45/day 14일이면 정확히 -0.45", () => {
    const series = Array.from({ length: 14 }, (_, i) => 73.85 - 0.45 * i);
    expect(observedDailyDelta(series)).toBeCloseTo(-0.45, 10);
  });

  it("상수 시계열이면 0", () => {
    const series = Array.from({ length: 14 }, () => 68);
    expect(observedDailyDelta(series)).toBeCloseTo(0, 10);
  });

  it("90일 시계열도 마지막 14일만 본다(앞부분 노이즈 무시)", () => {
    const tail = Array.from({ length: 14 }, (_, i) => 90 + 0.32 * i);
    const noiseHead = Array.from({ length: 76 }, (_, i) =>
      i % 2 === 0 ? 30 : 95,
    );
    expect(observedDailyDelta([...noiseHead, ...tail])).toBeCloseTo(0.32, 10);
  });

  it("14일 미만 입력이면 명시적 에러(predict와 동일한 최소 길이 계약)", () => {
    const short = Array.from({ length: 13 }, () => 65);
    expect(() => observedDailyDelta(short)).toThrow(/14/);
  });

  it("같은 입력 2회 호출은 동일 출력(결정성)", () => {
    const series = Array.from({ length: 20 }, (_, i) => 80 - 0.3 * i + 0.1);
    expect(observedDailyDelta(series)).toBe(observedDailyDelta(series));
  });
});
