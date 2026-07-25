"use client";

// 평년 대비 저수율 흐름 SVG 차트 — 순수 프리젠테이션 컴포넌트.
// 모든 좌표는 API 응답 값에서만 유도한다. 불확실성 밴드는 forecast[].low/high에
// 스케일만 적용한다(임의 확장 산식 금지 — plan 프로토타입 충돌점 표).
// 단계 임계값·라벨의 단일 출처는 lib/data/drought-stage.ts다(규칙 5).
// x축 날짜 라벨은 observedOn에서만 온다(showDates=상세 전용). 새 예측 수학은 없다.

import type { ForecastResponse } from "@mulsigye/contracts";
import { useEffect, useState } from "react";

import { prefersReducedMotion } from "../lib/client/reduced-motion";
import {
  DROUGHT_STAGE_THRESHOLDS,
  STAGE_LABEL_BY_CODE,
  type DroughtStageCode,
} from "../lib/data/drought-stage";
import styles from "./TrendChart.module.css";

// viewBox 고정(너비 100% 반응형) 좌표계와 안쪽 여백.
const WIDTH = 640;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

/** y축 범위를 임계값 쪽으로 넓힐지 판단하는 근접 여유(%p). */
const THRESHOLD_NEAR_MARGIN = 8;
/** 데이터 위아래 시각 여백(%p). */
const RANGE_PADDING = 5;

/**
 * 임계선 목록 — 값 아래로 내려가면 '해당 단계'에 드는 경계선.
 * 예: 70% 선 아래 = 관심(watch). 값·라벨 모두 drought-stage에서만 가져온다.
 */
const THRESHOLD_LINES: ReadonlyArray<{
  code: DroughtStageCode;
  value: number;
}> = [
  { code: "watch", value: DROUGHT_STAGE_THRESHOLDS.ok },
  { code: "care", value: DROUGHT_STAGE_THRESHOLDS.watch },
  { code: "alert", value: DROUGHT_STAGE_THRESHOLDS.care },
  { code: "crit", value: DROUGHT_STAGE_THRESHOLDS.alert },
];

/** "YYYY-MM-DD" → "M/D"(앞자리 0 제거). 파싱 실패 시 원문 반환. */
function formatMonthDay(observedOn: string): string {
  const parts = observedOn.split("-");
  const m = parts[1];
  const d = parts[2];
  if (m === undefined || d === undefined) {
    return observedOn;
  }
  return `${Number(m)}/${Number(d)}`;
}

interface TrendChartProps {
  forecast: ForecastResponse;
  /** viewBox 높이. 메인 250, 상세 300. */
  height?: number;
  /** 상세 차트에서만 x축 날짜 라벨(observedOn)을 표시한다. 미니는 false. */
  showDates?: boolean;
}

export function TrendChart({
  forecast: data,
  height = 250,
  showDates = false,
}: TrendChartProps) {
  const history = data.history;
  const future = data.forecast;

  // 그려-들어오기(draw-in) 애니메이션 — 마운트 후 왼→오른 클립을 열어 선·밴드를 드러낸다.
  // reduced-motion이면 즉시 최종 상태로 두고 전환을 건다(prefers-reduced-motion CSS도 병행 보증).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (
      prefersReducedMotion() ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      setShown(true);
      return;
    }
    const raf = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  // y 범위: 실측·예측·밴드 전체 값 + 근처 임계값 + 위아래 여백.
  const values: number[] = [];
  for (const point of history) {
    values.push(point.avgRatio);
  }
  for (const point of future) {
    values.push(point.avgRatio, point.low, point.high);
  }
  let lo = values.length > 0 ? Math.min(...values) : 0;
  let hi = values.length > 0 ? Math.max(...values) : 100;
  for (const line of THRESHOLD_LINES) {
    if (
      line.value > lo - THRESHOLD_NEAR_MARGIN &&
      line.value < hi + THRESHOLD_NEAR_MARGIN
    ) {
      lo = Math.min(lo, line.value);
      hi = Math.max(hi, line.value);
    }
  }
  lo = Math.max(0, Math.floor(lo - RANGE_PADDING));
  hi = Math.ceil(hi + RANGE_PADDING);

  const total = history.length + future.length;
  const x = (index: number) =>
    PAD_LEFT +
    (WIDTH - PAD_LEFT - PAD_RIGHT) * (index / Math.max(1, total - 1));
  const y = (value: number) =>
    PAD_TOP + (height - PAD_TOP - PAD_BOTTOM) * (1 - (value - lo) / (hi - lo));
  const pt = (index: number, value: number) =>
    `${x(index).toFixed(1)},${y(value).toFixed(1)}`;

  // 실측 실선(최근 30일).
  const actualPath = history
    .map((point, i) => `${i === 0 ? "M" : "L"}${pt(i, point.avgRatio)}`)
    .join("");

  // 예측 점선 — 오늘(마지막 실측)에서 이어 그린다.
  let forecastPath = "";
  if (future.length > 0) {
    const segments: string[] = [];
    const lastHistory = history[history.length - 1];
    if (lastHistory !== undefined) {
      segments.push(`M${pt(history.length - 1, lastHistory.avgRatio)}`);
      future.forEach((point, j) => {
        segments.push(`L${pt(history.length + j, point.avgRatio)}`);
      });
    } else {
      future.forEach((point, j) => {
        segments.push(`${j === 0 ? "M" : "L"}${pt(j, point.avgRatio)}`);
      });
    }
    forecastPath = segments.join("");
  }

  // 불확실성 밴드 — 위 가장자리 high(순방향) + 아래 가장자리 low(역방향) 폴리곤.
  let bandPath = "";
  if (future.length > 0) {
    const top = future
      .map(
        (point, j) =>
          `${j === 0 ? "M" : "L"}${pt(history.length + j, point.high)}`,
      )
      .join("");
    const bottom = [...future]
      .map((point, j) => ({ index: history.length + j, low: point.low }))
      .reverse()
      .map((edge) => `L${pt(edge.index, edge.low)}`)
      .join("");
    bandPath = `${top}${bottom}Z`;
  }

  // 임계선은 확정된 y 범위 안에 드는 것만 렌더한다.
  const visibleThresholds = THRESHOLD_LINES.filter(
    (line) => line.value >= lo && line.value <= hi,
  );

  const todayX = history.length > 0 ? x(history.length - 1) : null;

  // 스크린리더용 요약(visually-hidden). 예측 단정 표현 금지 — "보여요"만 사용.
  const firstHistory = history[0];
  const lastHistory = history[history.length - 1];
  const lastFuture = future[future.length - 1];
  const summaryParts = ["지역 평년 대비 저수율 흐름 그래프예요."];
  if (firstHistory !== undefined && lastHistory !== undefined) {
    summaryParts.push(
      `지난 ${history.length}일 실측은 ${firstHistory.avgRatio}%에서 ${lastHistory.avgRatio}%였어요.`,
    );
  }
  if (lastFuture !== undefined) {
    summaryParts.push(
      `앞으로 ${future.length}일은 ${lastFuture.low}%에서 ${lastFuture.high}% 사이로 보여요.`,
    );
  }
  // 상세 차트는 날짜 축을 함께 읽어준다(observedOn에서만).
  if (showDates && firstHistory !== undefined && lastFuture !== undefined) {
    summaryParts.push(
      `기간은 ${formatMonthDay(firstHistory.observedOn)}부터 ${formatMonthDay(lastFuture.observedOn)}까지예요.`,
    );
  }

  // 그려-들어오기 클립 id — 높이별로 고정(같은 문서 내 미니·상세 충돌 방지, 결정적).
  const clipId = `trend-reveal-${height}`;
  const revealClass = shown
    ? `${styles.revealClip} ${styles.shown}`
    : styles.revealClip;
  const bandClass = shown ? `${styles.band} ${styles.bandShown}` : styles.band;

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={`지역 평년 대비 저수율 흐름 그래프: 실측 ${history.length}일과 예측 ${future.length}일`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              className={revealClass}
              x={0}
              y={0}
              width={WIDTH}
              height={height}
            />
          </clipPath>
        </defs>

        {/* y축 최소·최대 라벨 */}
        <text
          className={styles.axisLabel}
          x={PAD_LEFT - 6}
          y={(y(hi) + 4).toFixed(1)}
          textAnchor="end"
        >
          {hi}%
        </text>
        <text
          className={styles.axisLabel}
          x={PAD_LEFT - 6}
          y={(y(lo) + 4).toFixed(1)}
          textAnchor="end"
        >
          {lo}%
        </text>

        {/* 단계 임계선(범위 안만) */}
        {visibleThresholds.map((line) => (
          <g key={line.code}>
            <line
              className={styles.thresholdLine}
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y(line.value).toFixed(1)}
              y2={y(line.value).toFixed(1)}
            />
            <text
              className={`${styles.thresholdLabel} ${styles[line.code]}`}
              x={WIDTH - PAD_RIGHT}
              y={(y(line.value) - 4).toFixed(1)}
              textAnchor="end"
            >
              {STAGE_LABEL_BY_CODE[line.code]}
            </text>
          </g>
        ))}

        {/* 오늘 수직선·x축 라벨 */}
        {todayX !== null ? (
          <>
            <line
              className={styles.todayLine}
              x1={todayX.toFixed(1)}
              x2={todayX.toFixed(1)}
              y1={PAD_TOP}
              y2={height - PAD_BOTTOM}
            />
            <text
              className={styles.todayLabel}
              x={todayX.toFixed(1)}
              y={height - 9}
              textAnchor="middle"
            >
              오늘
            </text>
            <text
              className={styles.axisTick}
              data-testid="trend-axis-start"
              x={PAD_LEFT}
              y={height - 9}
            >
              {showDates && firstHistory !== undefined
                ? formatMonthDay(firstHistory.observedOn)
                : `${history.length}일 전`}
            </text>
          </>
        ) : null}
        {future.length > 0 ? (
          <text
            className={styles.axisTick}
            data-testid="trend-axis-end"
            x={WIDTH - PAD_RIGHT}
            y={height - 9}
            textAnchor="end"
          >
            {showDates && lastFuture !== undefined
              ? formatMonthDay(lastFuture.observedOn)
              : `+${future.length}일`}
          </text>
        ) : null}

        {/* 선·밴드는 클립으로 왼→오른 드러낸다(축·임계선·오늘선은 정적). */}
        <g
          data-testid="trend-reveal"
          data-reveal={shown ? "shown" : "hidden"}
          clipPath={`url(#${clipId})`}
        >
          {/* 불확실성 밴드(API low/high 폴리곤) */}
          {bandPath !== "" ? (
            <path className={bandClass} data-testid="trend-band" d={bandPath} />
          ) : null}

          {/* 실측 실선 */}
          {actualPath !== "" ? (
            <path
              className={styles.actual}
              data-testid="trend-actual"
              d={actualPath}
            />
          ) : null}

          {/* 예측 점선 */}
          {forecastPath !== "" ? (
            <path
              className={styles.forecastLine}
              data-testid="trend-forecast"
              d={forecastPath}
            />
          ) : null}

          {/* 오늘 기준점 마커(basis.avgRatio) */}
          {todayX !== null ? (
            <circle
              className={styles.marker}
              cx={todayX.toFixed(1)}
              cy={y(data.basis.avgRatio).toFixed(1)}
              r={4.6}
            />
          ) : null}
        </g>
      </svg>
      <p className={styles.srOnly} data-testid="trend-summary">
        {summaryParts.join(" ")}
      </p>
    </div>
  );
}
