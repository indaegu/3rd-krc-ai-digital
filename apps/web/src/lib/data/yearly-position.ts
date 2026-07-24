// 올해 흐름 속 현재 위치 — 서버 확정 스냅샷의 단일 출처.
// 빌더(buildYearlyPosition)는 지역별 2025 avgRatio 분포를 11개 decile 분위수로 압축하고,
// CLI(scripts/build-yearly.ts)가 이 스키마로 검증해 data/yearly-position.json에 커밋한다.
// 런타임(status-service.ts)은 percentileOf/bucketOf로 현재 avgRatio의 위치만 계산한다.
// 결정적 순수 함수 계약: Date.now/네트워크/랜덤 접근 금지.
import { z } from "zod";

/** 이 스냅샷이 담는 분포의 기준 연도. */
export const YEARLY_POSITION_YEAR = 2025;

/** 유효 관측 일수가 이 값 미만인 지역은 스냅샷에서 제외한다(분포 신뢰 하한). */
export const YEARLY_MIN_COUNT = 30;

/** decile 경계 개수 = [min, p10, …, p90, max] 총 11개. */
export const BREAKPOINT_COUNT = 11;

/** 소수 2자리 반올림(-0은 0으로 정규화) — breakpoints 저장용. */
function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** value를 [min, max]로 클램프한다. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

/** data/yearly-position.json의 한 지역 항목. */
export const yearlyPositionEntrySchema = z.strictObject({
  year: z.literal(YEARLY_POSITION_YEAR),
  count: z.number().int().positive(),
  /** [min, p10, p20, …, p90, max] — 오름차순 decile 경계 11개(소수 2자리). */
  breakpoints: z.array(z.number()).length(BREAKPOINT_COUNT),
});

/** data/yearly-position.json 전체 형태 — sigunCode 키. */
export const yearlyPositionSchema = z.record(
  z.string(),
  yearlyPositionEntrySchema,
);

export type YearlyPositionEntry = z.infer<typeof yearlyPositionEntrySchema>;
export type YearlyPositionSnapshot = z.infer<typeof yearlyPositionSchema>;

/**
 * 지역별 avgRatio 값 배열 → decile 스냅샷.
 * 각 지역의 값을 정렬해 11개 decile 경계(선형 보간)를 소수 2자리로 낸다.
 * 관측이 YEARLY_MIN_COUNT 미만인 지역은 건너뛴다. 코드 정렬로 출력 순서까지 결정적이다.
 */
export function buildYearlyPosition(
  seriesByRegion: Readonly<Record<string, readonly number[]>>,
): YearlyPositionSnapshot {
  const out: Record<string, YearlyPositionEntry> = {};
  for (const sigunCode of Object.keys(seriesByRegion).sort()) {
    const values = seriesByRegion[sigunCode] ?? [];
    if (values.length < YEARLY_MIN_COUNT) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const breakpoints: number[] = [];
    for (let i = 0; i < BREAKPOINT_COUNT; i += 1) {
      breakpoints.push(
        round2(quantileSorted(sorted, i / (BREAKPOINT_COUNT - 1))),
      );
    }
    out[sigunCode] = {
      year: YEARLY_POSITION_YEAR,
      count: values.length,
      breakpoints,
    };
  }
  return out;
}

/**
 * value가 이 지역 연간 분포에서 차지하는 백분위(0..100, 정수).
 * breakpoint i는 백분위 i*10을 덮는다 — value가 든 구간을 선형 보간한다.
 * value ≤ min이면 0, ≥ max면 100. 동일 경계(구간 폭 0)는 구간 시작 백분위로 본다.
 */
export function percentileOf(
  breakpoints: readonly number[],
  value: number,
): number {
  const min = breakpoints[0];
  const max = breakpoints[breakpoints.length - 1];
  if (min === undefined || max === undefined) return 0;
  if (value <= min) return 0;
  if (value >= max) return 100;
  for (let i = 0; i < breakpoints.length - 1; i += 1) {
    const lo = breakpoints[i];
    const hi = breakpoints[i + 1];
    if (lo === undefined || hi === undefined) continue;
    if (value >= lo && value <= hi) {
      const span = hi - lo;
      const frac = span === 0 ? 0 : (value - lo) / span;
      const percentile = i * 10 + frac * 10;
      return clamp(Math.round(percentile), 0, 100);
    }
  }
  return 100;
}

export type YearlyBucket = "low" | "mid" | "high";

/** 백분위를 세 구간으로 나눈다: <33.3 낮음, <66.7 보통, 그 이상 높음. */
export function bucketOf(percentile: number): YearlyBucket {
  if (percentile < 33.3) return "low";
  if (percentile < 66.7) return "mid";
  return "high";
}
