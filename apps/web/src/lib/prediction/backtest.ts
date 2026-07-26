// 백테스트 순수 엔진 — (지역별 avgRatio 시계열 map) → 리포트 코어.
// 결정적 순수 함수 계약: Date.now/네트워크/랜덤 접근 금지. 날짜 산술은 UTC 고정이다.
// 프로토콜(180일·마지막 origin=lastDate-지평, 14일 간격 rolling origin·누수 금지·MAE/RMSE·선택 규칙)은
// docs/prediction-model.md가 SSOT다. runAt/gitCommit/체크섬은 CLI(scripts/backtest.ts)가 주입한다.
import {
  FORECAST_HORIZON_DAYS,
  LINEAR_WINDOW_DAYS,
  MA_WINDOW_DAYS,
  MODEL_SIMPLICITY_ORDER,
  MODEL_VERSION,
  PREDICTION_MODEL_NAMES,
  SES_ALPHA,
  predict,
  type PredictionModelName,
} from "./models.ts";
import type { BacktestCore, ExclusionReason } from "./backtest-report.ts";

/** 유효 관측 일수가 이 값 미만인 지역은 제외한다(프로토콜 1항). */
export const MIN_VALID_DAYS = 180;

/** 연속 결측이 이 일수를 초과하는 지역은 제외한다(단계 3 플랜 신규 상수). */
export const MAX_GAP_DAYS = 7;

/** rolling origin을 만드는 창(마지막 N일). */
export const ORIGIN_WINDOW_DAYS = 90;

/** origin 간격(일). */
export const ORIGIN_STEP_DAYS = 14;

/** 14일 macro MAE 차이가 이 값(%p) 이하면 더 단순한 모델을 고른다(프로토콜 5항). */
export const TIE_BREAK_EPSILON_PP = 0.05;

/** 리포트 지표의 고정 소수 자리수 — 재실행 재현성 비교의 기준. */
export const METRIC_DECIMALS = 4;

export type BacktestPoint = { observedOn: string; avgRatio: number };

export type BacktestTestPoint = {
  observedOn: string;
  avgRatio: number;
  /** origin으로부터 며칠 뒤 실측인지(1..FORECAST_HORIZON_DAYS). */
  horizon: number;
};

const DAY_MS = 86_400_000;

function isoToUtcMs(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new Error(`날짜 형식(YYYY-MM-DD)이 아니다: ${iso}`);
  }
  return ms;
}

/** ISO 날짜에 일수를 더한다(음수 허용, UTC 고정). */
export function addDaysIso(iso: string, days: number): string {
  return new Date(isoToUtcMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** from → to 일수 차(to가 미래면 양수). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((isoToUtcMs(to) - isoToUtcMs(from)) / DAY_MS);
}

/** 지표를 고정 소수 자리로 반올림한다(-0은 0으로 정규화). */
export function roundMetric(value: number): number {
  const factor = 10 ** METRIC_DECIMALS;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 소수 2자리 반올림(-0은 0으로 정규화) — bandScale 저장용. */
function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** value를 [min, max]로 클램프한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 시계열 마지막 날짜 기준 rolling origin(오름차순).
 * origin_k = lastDate − (지평일수 + 14·k), k = maxSteps-1 … 0.
 *
 * 두 불변식을 동시에 지킨다.
 *   ① 가장 최근 origin = lastDate − 지평일수 → 모든 origin이 **꽉 찬 평가 창**을 갖는다
 *      (긴 horizon의 잔차 표본이 최근 origin에서만 비지 않는다).
 *   ② 가장 오래된 origin도 마지막 [ORIGIN_WINDOW_DAYS]일 안이다(프로토콜 3항).
 * 지평이 길어질수록 ②를 지키느라 origin 개수가 줄어든다(지평 30일 → 5개).
 */
export function generateOriginDates(lastDate: string): string[] {
  const span = ORIGIN_WINDOW_DAYS - FORECAST_HORIZON_DAYS;
  if (span < 0) return [];
  const maxSteps = Math.floor(span / ORIGIN_STEP_DAYS) + 1;
  const origins: string[] = [];
  for (let k = maxSteps - 1; k >= 0; k -= 1) {
    origins.push(
      addDaysIso(lastDate, -(FORECAST_HORIZON_DAYS + ORIGIN_STEP_DAYS * k)),
    );
  }
  return origins;
}

/**
 * origin 기준 분할: train = observedOn ≤ origin, test = origin < observedOn ≤ origin+지평일수.
 * 미래값이 학습에 들어가지 않는 것을 이 분할 하나로 보장한다(프로토콜 2항).
 */
export function splitAtOrigin(
  points: readonly BacktestPoint[],
  origin: string,
): { train: BacktestPoint[]; test: BacktestTestPoint[] } {
  const testEnd = addDaysIso(origin, FORECAST_HORIZON_DAYS);
  const train: BacktestPoint[] = [];
  const test: BacktestTestPoint[] = [];
  for (const point of points) {
    if (point.observedOn <= origin) {
      train.push(point);
    } else if (point.observedOn <= testEnd) {
      test.push({
        ...point,
        horizon: daysBetweenIso(origin, point.observedOn),
      });
    }
  }
  return { train, test };
}

type Residual = { horizon: number; error: number };

type MetricSet = {
  mae7: number;
  rmse7: number;
  mae14: number;
  rmse14: number;
  mae30: number;
  rmse30: number;
};

type EvaluatedRegion = {
  sigunCode: string;
  originCount: number;
  residuals: Record<PredictionModelName, Residual[]>;
};

/** 날짜 중복 제거(뒤 값 우선) 후 오름차순 정렬. */
function normalizePoints(points: readonly BacktestPoint[]): BacktestPoint[] {
  const byDate = new Map<string, number>();
  for (const point of points) {
    byDate.set(point.observedOn, point.avgRatio);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([observedOn, avgRatio]) => ({ observedOn, avgRatio }));
}

/** 연속 관측 사이의 최대 결측 일수. */
function maxMissingRun(points: readonly BacktestPoint[]): number {
  let max = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (prev === undefined || next === undefined) continue;
    const missing = daysBetweenIso(prev.observedOn, next.observedOn) - 1;
    if (missing > max) max = missing;
  }
  return max;
}

/**
 * 잔차 목록 → MAE/RMSE. 7일 = horizon 1~7, 14일 = 1~14, 30일 = 1~지평끝.
 * **각 지표는 반드시 자기 구간으로 걸러서 센다** — 지평을 30으로 늘렸을 때 mae14가 조용히
 * 30일치 평균이 되면 화면의 "14일 ±X%p"가 거짓이 된다. 반올림 없이 원값을 낸다.
 */
function metricsFrom(residuals: readonly Residual[]): MetricSet {
  const within7 = residuals.filter((r) => r.horizon <= 7);
  const within14 = residuals.filter((r) => r.horizon <= 14);
  return {
    mae7: meanAbs(within7),
    rmse7: rootMeanSquare(within7),
    mae14: meanAbs(within14),
    rmse14: rootMeanSquare(within14),
    mae30: meanAbs(residuals),
    rmse30: rootMeanSquare(residuals),
  };
}

function meanAbs(residuals: readonly Residual[]): number {
  let sum = 0;
  for (const r of residuals) sum += Math.abs(r.error);
  return sum / residuals.length;
}

function rootMeanSquare(residuals: readonly Residual[]): number {
  let sum = 0;
  for (const r of residuals) sum += r.error * r.error;
  return Math.sqrt(sum / residuals.length);
}

/** 경험적 분위수(선형 보간, R type-7). 입력은 오름차순 정렬 배열. */
function quantileSorted(sorted: readonly number[], p: number): number {
  const first = sorted[0];
  if (first === undefined) return 0;
  const index = p * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const loValue = sorted[lo] ?? first;
  const hiValue = sorted[hi] ?? loValue;
  return loValue + (hiValue - loValue) * (index - lo);
}

function roundMetricSet(set: MetricSet): MetricSet {
  return {
    mae7: roundMetric(set.mae7),
    rmse7: roundMetric(set.rmse7),
    mae14: roundMetric(set.mae14),
    rmse14: roundMetric(set.rmse14),
    mae30: roundMetric(set.mae30),
    rmse30: roundMetric(set.rmse30),
  };
}

/** 지역별 시계열 map → 리포트 코어. 지역 코드 정렬로 출력 순서까지 결정적이다. */
export function runBacktest(
  seriesByRegion: Readonly<Record<string, readonly BacktestPoint[]>>,
): BacktestCore {
  const excluded: { sigunCode: string; reason: ExclusionReason }[] = [];
  const evaluated: EvaluatedRegion[] = [];
  let totalOrigins = 0;
  let sampleCount = 0;

  for (const sigunCode of Object.keys(seriesByRegion).sort()) {
    const points = normalizePoints(seriesByRegion[sigunCode] ?? []);
    if (points.length < MIN_VALID_DAYS) {
      excluded.push({ sigunCode, reason: "insufficient_days" });
      continue;
    }
    if (maxMissingRun(points) > MAX_GAP_DAYS) {
      excluded.push({ sigunCode, reason: "long_gap" });
      continue;
    }

    const lastPoint = points[points.length - 1];
    if (lastPoint === undefined) {
      excluded.push({ sigunCode, reason: "no_evaluable_origin" });
      continue;
    }

    // 모델 목록이 늘어도 빠뜨리지 않도록 이름 배열에서 만든다(하드코딩한 객체는 새 모델을 놓친다).
    const residuals = Object.fromEntries(
      PREDICTION_MODEL_NAMES.map((name) => [name, [] as Residual[]]),
    ) as Record<PredictionModelName, Residual[]>;
    let originCount = 0;
    let regionSamples = 0;

    for (const origin of generateOriginDates(lastPoint.observedOn)) {
      const { train, test } = splitAtOrigin(points, origin);
      // 학습 길이 하한은 모델 최소 입력이다(지평과 무관 — 지평을 늘려도 하한은 그대로).
      if (train.length < LINEAR_WINDOW_DAYS || test.length === 0) continue;
      originCount += 1;
      regionSamples += test.length;
      const trainValues = train.map((point) => point.avgRatio);
      for (const model of PREDICTION_MODEL_NAMES) {
        const forecast = predict(model, trainValues);
        for (const point of test) {
          const predicted = forecast[point.horizon - 1];
          if (predicted === undefined) continue;
          residuals[model].push({
            horizon: point.horizon,
            error: point.avgRatio - predicted,
          });
        }
      }
    }

    const hasShortHorizon = residuals.naive.some((r) => r.horizon <= 7);
    if (originCount === 0 || !hasShortHorizon) {
      excluded.push({ sigunCode, reason: "no_evaluable_origin" });
      continue;
    }

    totalOrigins += originCount;
    sampleCount += regionSamples;
    evaluated.push({ sigunCode, originCount, residuals });
  }

  // 모델별 지역 지표 + macro average(지역별 지표의 단순 평균 — 프로토콜 4항).
  const macroByModel = {} as Record<PredictionModelName, MetricSet>;
  const models = {} as BacktestCore["models"];
  for (const model of PREDICTION_MODEL_NAMES) {
    const byRegion: Record<
      string,
      MetricSet & { originCount: number; bandScale: number }
    > = {};
    const regionSets: MetricSet[] = [];
    // bandScale 계산에 쓸 지역별 원(raw) rmse14 — macro 확정 후 채운다.
    const rawRmse14ByRegion: { code: string; rmse14: number }[] = [];
    for (const region of evaluated) {
      const set = metricsFrom(region.residuals[model]);
      regionSets.push(set);
      byRegion[region.sigunCode] = {
        originCount: region.originCount,
        ...roundMetricSet(set),
        // 아래에서 이 모델 자신의 macro rmse14로 채운다(모델별 자기정합).
        bandScale: 1,
      };
      rawRmse14ByRegion.push({ code: region.sigunCode, rmse14: set.rmse14 });
    }
    const macro: MetricSet =
      regionSets.length === 0
        ? { mae7: 0, rmse7: 0, mae14: 0, rmse14: 0, mae30: 0, rmse30: 0 }
        : {
            mae7: mean(regionSets.map((s) => s.mae7)),
            rmse7: mean(regionSets.map((s) => s.rmse7)),
            mae14: mean(regionSets.map((s) => s.mae14)),
            rmse14: mean(regionSets.map((s) => s.rmse14)),
            mae30: mean(regionSets.map((s) => s.mae30)),
            rmse30: mean(regionSets.map((s) => s.rmse30)),
          };
    macroByModel[model] = macro;
    // 지역별 밴드 배율 = clamp(round2(지역 rmse14 / macro rmse14), 0.6, 1.6).
    // 안정 지역(작은 rmse14)은 <1로 좁히고, 변동 큰 지역은 >1로 넓힌다.
    const globalRmse14 = macro.rmse14;
    for (const entry of rawRmse14ByRegion) {
      const scale =
        globalRmse14 === 0
          ? 1
          : clamp(round2(entry.rmse14 / globalRmse14), 0.6, 1.6);
      const target = byRegion[entry.code];
      if (target !== undefined) target.bandScale = scale;
    }
    models[model] = { macro: roundMetricSet(macro), byRegion };
  }

  // 선택 규칙: 14일 macro MAE 최저, 차이 ≤ 0.05%p면 단순성 서열(프로토콜 5항).
  let best: PredictionModelName = PREDICTION_MODEL_NAMES[0];
  for (const model of PREDICTION_MODEL_NAMES) {
    if (macroByModel[model].mae14 < macroByModel[best].mae14) best = model;
  }
  const candidates = MODEL_SIMPLICITY_ORDER.filter(
    (model) =>
      macroByModel[model].mae14 - macroByModel[best].mae14 <=
      TIE_BREAK_EPSILON_PP + Number.EPSILON,
  );
  const selectedName = candidates[0] ?? best;
  const rule = candidates.length > 1 ? "simplicity_tiebreak" : "lowest_mae14";
  const tiedWith = candidates.filter((model) => model !== selectedName);

  // 채택 모델의 horizon별 잔차 경험적 p25/p75(전 지역·전 origin 풀링, 50% 구간).
  const pooled: number[][] = Array.from(
    { length: FORECAST_HORIZON_DAYS },
    () => [],
  );
  for (const region of evaluated) {
    for (const residual of region.residuals[selectedName]) {
      pooled[residual.horizon - 1]?.push(residual.error);
    }
  }
  const residualQuantiles = pooled.map((errors, index) => {
    const sorted = [...errors].sort((a, b) => a - b);
    return {
      horizon: index + 1,
      count: sorted.length,
      p25: roundMetric(quantileSorted(sorted, 0.25)),
      p75: roundMetric(quantileSorted(sorted, 0.75)),
    };
  });

  return {
    reportVersion: "backtest-v1",
    modelParams: {
      modelVersion: MODEL_VERSION,
      linearWindowDays: LINEAR_WINDOW_DAYS,
      maWindowDays: MA_WINDOW_DAYS,
      sesAlpha: SES_ALPHA,
      horizonDays: FORECAST_HORIZON_DAYS,
      minValidDays: MIN_VALID_DAYS,
      maxGapDays: MAX_GAP_DAYS,
      originWindowDays: ORIGIN_WINDOW_DAYS,
      originStepDays: ORIGIN_STEP_DAYS,
      tieBreakEpsilonPp: TIE_BREAK_EPSILON_PP,
      metricDecimals: METRIC_DECIMALS,
    },
    regionCount: evaluated.length,
    originCount: totalOrigins,
    sampleCount,
    models,
    selectedModel: {
      name: selectedName,
      rule,
      tiedWith,
      ...roundMetricSet(macroByModel[selectedName]),
    },
    residualQuantiles,
    excluded,
  };
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}
