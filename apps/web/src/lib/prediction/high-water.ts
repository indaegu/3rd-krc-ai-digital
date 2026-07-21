// 만수위 '참고' 판정 — 결정적 순수 함수. docs/prediction-model.md 만수위 절이 SSOT.
// 입력은 대표 저수지 '원저수율 rate(%)' 시계열 전용이다. 지역 avgRatio(평년 대비 %)를
// 절대 넣지 않는다 — 두 값의 의미가 다르다. 독자적인 홍수 단계·경보를 만들지 않는다.

/** 만수위 참고 배너의 원저수율 하한(%). */
export const HIGH_WATER_RATE_THRESHOLD = 95;

/**
 * 최신 원저수율이 95% 이상이고 상승 추세(최신 값 > 직전 값)일 때만 true.
 * 관측이 2개 미만이면 추세를 알 수 없으므로 false.
 */
export function isHighWaterNotice(rateSeries: readonly number[]): boolean {
  if (rateSeries.length < 2) return false;
  const latest = rateSeries[rateSeries.length - 1];
  const previous = rateSeries[rateSeries.length - 2];
  if (latest === undefined || previous === undefined) return false;
  return latest >= HIGH_WATER_RATE_THRESHOLD && latest > previous;
}
