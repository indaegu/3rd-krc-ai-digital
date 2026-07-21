// 다음 공식 단계 도달 가능 시점과 추세·도달 버킷 — 결정적 순수 함수.
// 산식은 docs/prediction-model.md, 임계값은 lib/data/drought-stage.ts가 단일 출처다
// (AGENTS.md 규칙 5 — 70/60/50/40을 이 모듈에 복제하지 않는다).
import {
  DROUGHT_STAGE_THRESHOLDS,
  type DroughtStageCode,
} from "../data/drought-stage.ts";

/** |d|가 이 값(%p/day) 미만이면 보합(stable)으로 본다. */
export const TREND_STABLE_EPSILON = 0.05;

/** days가 이 값을 넘으면 숫자를 표시하지 않는다("안정"). */
export const REACH_MAX_DAYS = 30;

export type TrendBucket = "rising" | "stable" | "falling";
export type ReachBucket = "none" | "within_7d" | "within_14d" | "within_30d";

/**
 * 현재 추세 유지 시 다음(더 나쁜) 단계 도달까지 일수. 1~30일만 숫자, 그 외 null.
 * d < 0 이고 r0 > t(다음 단계 임계값)일 때만 ceil((r0 - t) / |d|)를 계산한다.
 * 이미 심각(crit)이면 다음 단계가 없으므로 계산하지 않는다.
 */
export function daysToNextStage(
  r0: number,
  d: number,
  officialStageCode: DroughtStageCode,
): number | null {
  if (officialStageCode === "crit") return null;
  // 현재 단계의 '초과' 하한값이 곧 다음 단계로 내려가는 경계다(예: 관심의 60).
  const threshold = DROUGHT_STAGE_THRESHOLDS[officialStageCode];
  if (d >= 0 || r0 <= threshold) return null;
  const days = Math.ceil((r0 - threshold) / Math.abs(d));
  return days >= 1 && days <= REACH_MAX_DAYS ? days : null;
}

/** 도달 일수 → 표시 버킷. null(안정)과 30일 초과는 none. */
export function toReachBucket(days: number | null): ReachBucket {
  if (days === null || days > REACH_MAX_DAYS) return "none";
  if (days <= 7) return "within_7d";
  if (days <= 14) return "within_14d";
  return "within_30d";
}

/** 일일 변화량 d(%p/day) → 추세 버킷. |d| < ε 이면 stable, 경계값은 방향 유지. */
export function toTrendBucket(d: number): TrendBucket {
  if (Math.abs(d) < TREND_STABLE_EPSILON) return "stable";
  return d < 0 ? "falling" : "rising";
}
