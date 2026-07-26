// 지역 평년 대비(avgRatio) 오늘 값 추정 — 결정적 순수 함수.
//
// 공표 논가뭄지도는 연 1회만 갱신돼 오늘 값이 없다. 저수지 단위 실측을 공사의 통합저수율
// 정의(유효저수량 가중 평균)로 집계하고, 같은 날짜의 공표 평년값으로 나눠 평년 대비를 만든다.
// 임계값(70/60/50/40)은 drought-stage.ts 단일 출처를 그대로 쓴다(여기서 복제하지 않는다).
//
// 사용 조건은 AGENTS.md 규칙 5 예외 조항과 같다.
//   1) 산출물(region-estimator.json)에서 usable=true인 지역만 — 게이트는 학습에 쓰지 않은
//      검증 구간에서 판정했고, 화면에 밝히는 오차는 그 판정에도 쓰지 않은 시험 구간 값이다
//   2) 오늘 관측이 학습 때 쓴 용량의 [MIN_CAPACITY_RATIO] 이상을 덮을 때만
//   3) 그 밖에는 계산하지 않고 null을 돌려 공표값 폴백을 유도한다
//
// 산출물 생성·검증: `pnpm build:estimator`, `test/region-estimator-gate.test.ts`.

import estimatorReport from "../../../../../data/snapshots/region-estimator.json" with { type: "json" };
import reservoirsJson from "../../../../../data/snapshots/reservoirs.json" with { type: "json" };

/**
 * 오늘 관측이 시군 유효저수량의 이 비율 이상을 덮어야 추정한다.
 * 못 덮은 시설은 "덮은 시설의 평균과 같다"고 가정하는 셈이라, 그 비중을 20% 아래로 묶는다.
 * (실측: 수위 API의 시군 조회 커버리지는 제주·아산·의성·나주 모두 1.00이라 손해가 없다.)
 */
export const MIN_CAPACITY_RATIO = 0.8;

export interface ReservoirCapacity {
  facCode: string;
  /** 유효저수량. 0 이하면 가중치가 없어 제외한다. */
  effectiveStorage: number;
}

export interface RegionEstimateInput {
  sigunCode: string;
  /** 오늘(또는 대상일) 관측된 저수지별 원저수율 %. 값이 없는 저수지는 넣지 않는다. */
  ratesByFacCode: ReadonlyMap<string, number>;
  /** 이 시군의 저수지 제원(유효저수량). */
  reservoirs: readonly ReservoirCapacity[];
  /** 대상일(KST 달력일 YYYY-MM-DD). 평년값을 월-일로 찾는 데 쓴다. */
  observedOn: string;
}

export interface RegionEstimate {
  /** 추정 평년 대비 %. */
  avgRatio: number;
  /** 추정 통합저수율 %(보정 반영). */
  regionalRate: number;
  /** 사용한 공표 평년값 %. */
  normalRate: number;
  observedOn: string;
  /** 집계에 들어간 저수지 수와 용량 비중(품질 근거). */
  reservoirCount: number;
  capacityRatio: number;
  /** 이 지역 모델의 검증 오차(%p) — 화면·응답에 그대로 밝힌다. */
  maePp: number;
}

interface RegionModel {
  factor: number;
  trainMae: number;
  /** 게이트를 판정한 구간의 오차 — usable은 오직 이 값으로 정해졌다. */
  validMae: number;
  /** 어떤 결정에도 쓰지 않은 구간의 오차. 화면에는 이 값을 밝힌다. */
  testMae: number | null;
  sampleDays: number;
  validDays: number;
  reservoirCount: number;
  capacityShare: number;
  usable: boolean;
}

const REGIONS = estimatorReport.regions as Record<string, RegionModel>;
const NORMALS = estimatorReport.normals as Record<
  string,
  Record<string, number>
>;

/**
 * 시군의 저수지 제원(유효저수량). 학습 때 쓴 것과 **같은 스냅샷**이라 분모 정의가 어긋나지 않는다.
 * 값이 없는 시설은 가중치를 줄 수 없어 제외한다.
 */
export function reservoirCapacitiesFor(
  sigunCode: string,
): readonly ReservoirCapacity[] {
  const all = reservoirsJson as {
    facCode: string;
    sigunCode: string;
    effectiveStorage: number | null;
  }[];
  return all.flatMap((item) =>
    item.sigunCode === sigunCode &&
    item.effectiveStorage !== null &&
    item.effectiveStorage > 0
      ? [{ facCode: item.facCode, effectiveStorage: item.effectiveStorage }]
      : [],
  );
}

/** 이 시군에 추정 모델이 있고 게이트를 통과했는지. */
export function isEstimatableRegion(sigunCode: string): boolean {
  return REGIONS[sigunCode]?.usable === true;
}

/** 시군·날짜의 공표 평년 저수율(%). 없으면 null. */
export function normalRateFor(
  sigunCode: string,
  observedOn: string,
): number | null {
  const monthDay = observedOn.slice(5);
  const value = NORMALS[sigunCode]?.[monthDay];
  return typeof value === "number" && value > 0 ? value : null;
}

/**
 * 오늘 평년 대비 추정. 조건을 하나라도 못 채우면 null(→ 공표값 폴백)이다.
 *
 * 통합저수율 = Σ(저수율×유효저수량)/Σ유효저수량 × 보정계수
 * 평년 대비  = 통합저수율 ÷ 평년 × 100
 */
export function estimateRegionAvgRatio(
  input: RegionEstimateInput,
): RegionEstimate | null {
  const model = REGIONS[input.sigunCode];
  if (model === undefined || !model.usable) {
    return null;
  }
  const normalRate = normalRateFor(input.sigunCode, input.observedOn);
  if (normalRate === null) {
    return null;
  }

  let weighted = 0;
  let covered = 0;
  let total = 0;
  let count = 0;
  for (const reservoir of input.reservoirs) {
    if (reservoir.effectiveStorage <= 0) continue;
    total += reservoir.effectiveStorage;
    const rate = input.ratesByFacCode.get(reservoir.facCode);
    if (rate === undefined || !Number.isFinite(rate) || rate < 0) continue;
    weighted += rate * reservoir.effectiveStorage;
    covered += reservoir.effectiveStorage;
    count += 1;
  }
  if (covered <= 0 || total <= 0) {
    return null;
  }

  // 오늘 관측이 이 시군 용량의 일부만 덮으면 통합저수율이 편향된다 — 그럴 땐 추정하지 않는다.
  const capacityRatio = covered / total;
  if (capacityRatio < MIN_CAPACITY_RATIO) {
    return null;
  }

  const regionalRate = (weighted / covered) * model.factor;
  const avgRatio = (regionalRate / normalRate) * 100;
  if (!Number.isFinite(avgRatio) || avgRatio < 0) {
    return null;
  }

  return {
    avgRatio: Math.round(avgRatio * 10) / 10,
    regionalRate: Math.round(regionalRate * 10) / 10,
    normalRate,
    observedOn: input.observedOn,
    reservoirCount: count,
    capacityRatio: Math.round(capacityRatio * 1000) / 1000,
    // 어떤 결정에도 쓰지 않은 시험 구간 오차를 밝힌다. 그 구간이 없으면 게이트 구간 오차를 쓴다.
    maePp: model.testMae ?? model.validMae,
  };
}

export interface DatedObservation {
  facCode: string;
  observedOn: string;
  rate: number | null;
}

/**
 * 여러 날짜가 섞인 시군 관측에서 **커버리지를 채우는 가장 최근 날짜**로 추정한다.
 *
 * 오늘 치는 아직 일부 시설만 올라와 있을 수 있다. 그 상태로 집계하면 통합저수율이 편향되므로,
 * 최신 날짜부터 하루씩 뒤로 물러나며 처음으로 조건을 만족하는 날을 쓴다. 끝까지 없으면 null이다.
 */
export function estimateFromObservations(input: {
  sigunCode: string;
  reservoirs: readonly ReservoirCapacity[];
  observations: readonly DatedObservation[];
}): RegionEstimate | null {
  if (!isEstimatableRegion(input.sigunCode)) {
    return null;
  }

  const byDate = new Map<string, Map<string, number>>();
  for (const observation of input.observations) {
    if (observation.rate === null || !Number.isFinite(observation.rate)) {
      continue;
    }
    const bucket = byDate.get(observation.observedOn) ?? new Map();
    bucket.set(observation.facCode, observation.rate);
    byDate.set(observation.observedOn, bucket);
  }

  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1));
  for (const observedOn of dates) {
    const estimate = estimateRegionAvgRatio({
      sigunCode: input.sigunCode,
      observedOn,
      reservoirs: input.reservoirs,
      ratesByFacCode: byDate.get(observedOn) ?? new Map(),
    });
    if (estimate !== null) {
      return estimate;
    }
  }
  return null;
}
