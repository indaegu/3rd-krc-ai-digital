// avgRatio 14일 예측 모델 4종 — 결정적 순수 함수(Date.now/네트워크/랜덤 금지).
// 입력은 날짜 오름차순 avgRatio 시계열(number[]), 출력은 14일 예측 number[].
// 정의·역할·상수 값은 docs/prediction-model.md가 SSOT다.

export const PREDICTION_MODEL_NAMES = [
  "naive",
  "ma7",
  "linear",
  "ses",
] as const;
export type PredictionModelName = (typeof PREDICTION_MODEL_NAMES)[number];

/** 예측 지평(일). forecast[13]이 14일 뒤 값이다. */
export const FORECAST_HORIZON_DAYS = 14;

/** linear 회귀에 쓰는 최근 관측 창(일). */
export const LINEAR_WINDOW_DAYS = 14;

/** ma7 평균 창(일). */
export const MA_WINDOW_DAYS = 7;

/** ses 평활 계수. */
export const SES_ALPHA = 0.3;

/** 모델 파라미터 묶음의 버전. 상수를 바꾸면 버전을 올리고 백테스트 리포트를 다시 만든다. */
export const MODEL_VERSION = "pred-v1";

/** 백테스트 동률(≤0.05%p) 시 더 단순한 모델 선택에 쓰는 서열(앞이 더 단순). */
export const MODEL_SIMPLICITY_ORDER: readonly PredictionModelName[] = [
  "naive",
  "ma7",
  "ses",
  "linear",
];

/**
 * 모델별 최소 입력 길이(일). 모델 간 공정 비교를 위해 전 모델 14일로 통일한다
 * (linear가 LINEAR_WINDOW_DAYS=14를 요구하고, 나머지도 같은 하한을 따른다).
 */
export const MODEL_MIN_INPUT_DAYS: Record<PredictionModelName, number> = {
  naive: FORECAST_HORIZON_DAYS,
  ma7: FORECAST_HORIZON_DAYS,
  linear: LINEAR_WINDOW_DAYS,
  ses: FORECAST_HORIZON_DAYS,
};

/** 모델 이름으로 14일 예측을 낸다. 입력이 최소 길이(14일) 미만이면 에러. */
export function predict(
  model: PredictionModelName,
  series: readonly number[],
): number[] {
  const minDays = MODEL_MIN_INPUT_DAYS[model];
  if (series.length < minDays) {
    throw new Error(
      `${model} 모델은 최소 ${String(minDays)}일 입력이 필요한데 ${String(series.length)}일만 받았다`,
    );
  }
  switch (model) {
    case "naive":
      return predictNaive(series);
    case "ma7":
      return predictMa7(series);
    case "linear":
      return predictLinear(series);
    case "ses":
      return predictSes(series);
  }
}

/** 관측 추세 창(일) — observedDailyDelta가 보는 최근 관측 구간. */
export const OBSERVED_TREND_WINDOW_DAYS = 14;

/**
 * 추세·도달일용 일일 변화량 d(%p/day) — 최근 14일 "관측값"의 OLS 선형 회귀 기울기.
 * 2026-07-22 확정: 채택 모델(naive 등 수평 예측)은 추세를 표현할 수 없으므로
 * 추세·도달일은 이 관측 기울기에서, 예측선·밴드는 채택 모델 + 잔차 분위수에서
 * 각각 도출한다(근거 분리 — docs/prediction-model.md "d의 정의").
 * 입력이 14일 미만이면 명시적 에러(predict와 동일한 최소 길이 계약).
 */
export function observedDailyDelta(series: readonly number[]): number {
  if (series.length < OBSERVED_TREND_WINDOW_DAYS) {
    throw new Error(
      `observedDailyDelta는 최소 ${String(OBSERVED_TREND_WINDOW_DAYS)}일 관측이 필요한데 ${String(series.length)}일만 받았다`,
    );
  }
  return olsSlope(series.slice(-OBSERVED_TREND_WINDOW_DAYS));
}

/**
 * 일일 변화량 d(%p/day)의 예측 기반 정의: (forecast[13] - r0) / 14.
 * 모델 독립적이다 — naive는 자연히 0이 된다. 추세·도달일에는 쓰지 않는다
 * (observedDailyDelta가 대체 — 백테스트 진단 용도로만 남긴다).
 */
export function dailyDelta(r0: number, forecast: readonly number[]): number {
  const last = forecast[FORECAST_HORIZON_DAYS - 1];
  if (forecast.length !== FORECAST_HORIZON_DAYS || last === undefined) {
    throw new Error(
      `예측은 정확히 ${String(FORECAST_HORIZON_DAYS)}개여야 하는데 ${String(forecast.length)}개를 받았다`,
    );
  }
  return (last - r0) / FORECAST_HORIZON_DAYS;
}

/** 기준선 1: 마지막 값 유지. */
function predictNaive(series: readonly number[]): number[] {
  const last = lastValue(series);
  return Array.from({ length: FORECAST_HORIZON_DAYS }, () => last);
}

/** 기준선 2: 최근 7일 평균 유지. */
function predictMa7(series: readonly number[]): number[] {
  const window = series.slice(-MA_WINDOW_DAYS);
  const mean = sum(window) / window.length;
  return Array.from({ length: FORECAST_HORIZON_DAYS }, () => mean);
}

/** 주력 후보 1: 최근 LINEAR_WINDOW_DAYS일 최소제곱 선형회귀 외삽. */
function predictLinear(series: readonly number[]): number[] {
  const window = series.slice(-LINEAR_WINDOW_DAYS);
  const n = window.length;
  const xMean = (n - 1) / 2;
  const yMean = sum(window) / n;
  const slope = olsSlope(window);

  // 창 마지막 관측의 x = n-1. h일 뒤 예측 x = n-1+h.
  return Array.from(
    { length: FORECAST_HORIZON_DAYS },
    (_, i) => yMean + slope * (n - 1 + (i + 1) - xMean),
  );
}

/** x = 0..n-1 등간격 최소제곱(OLS) 기울기. linear 외삽과 observedDailyDelta가 공유한다. */
function olsSlope(window: readonly number[]): number {
  const n = window.length;
  const xMean = (n - 1) / 2;
  const yMean = sum(window) / n;
  let sxy = 0;
  let sxx = 0;
  window.forEach((y, x) => {
    sxy += (x - xMean) * (y - yMean);
    sxx += (x - xMean) * (x - xMean);
  });
  return sxy / sxx;
}

/** 주력 후보 2: 단순 지수평활(alpha=SES_ALPHA). 수준은 첫 값으로 초기화한다. */
function predictSes(series: readonly number[]): number[] {
  let level = series[0];
  if (level === undefined) {
    throw new Error("ses 입력이 비어 있다");
  }
  for (let i = 1; i < series.length; i += 1) {
    const value = series[i];
    if (value === undefined) continue;
    level = SES_ALPHA * value + (1 - SES_ALPHA) * level;
  }
  return Array.from({ length: FORECAST_HORIZON_DAYS }, () => level);
}

function lastValue(series: readonly number[]): number {
  const last = series[series.length - 1];
  if (last === undefined) {
    throw new Error("시계열이 비어 있다");
  }
  return last;
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
