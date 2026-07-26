// 대표 저수지 실측 저수율 선 그래프 — 예측·밴드 없이 관측만 그린다.
// 지역 평년 대비(avgRatio)와 축·의미가 다르므로 이 차트에서는 섞지 않는다
// (둘을 함께 보는 건 TrendChart의 "함께 보기" 모드가 오른쪽 축을 따로 두고 맡는다).
// 값은 서버 status.reservoir.rateHistory에서만 오고 여기서 만들지 않는다(규칙 10).
// x축 날짜 눈금 간격 규칙은 chart-axis 단일 출처를 쓴다.

import type { StatusResponse } from "@mulsigye/contracts";

import {
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  WIDTH,
  dateTickIndices,
  formatMonthDay,
  labelMinGap,
} from "./chart-axis";
import styles from "./TrendChart.module.css";

/** 기본 렌더 높이(px). 상세 화면은 height 프로퍼티로 키운다. */
const HEIGHT = 200;

/** y축 위아래 여유(%p) — 선이 테두리에 붙지 않게 한다. */
const RANGE_PADDING = 3;

interface ReservoirRateChartProps {
  history: StatusResponse["reservoir"]["rateHistory"];
  name?: string | undefined;
  /** 렌더 높이(px). 상세 화면은 크게, 메인 카드는 기본값으로 그린다. */
  height?: number;
}

export function ReservoirRateChart({
  history,
  name,
  height = HEIGHT,
}: ReservoirRateChartProps) {
  const points = history ?? [];
  if (points.length < 2) {
    return null;
  }

  const values = points.map((point) => point.rate);
  const lo = Math.max(0, Math.floor(Math.min(...values) - RANGE_PADDING));
  const hi = Math.ceil(Math.max(...values) + RANGE_PADDING);
  const span = hi <= lo ? 1 : hi - lo;

  const x = (index: number) =>
    PAD_LEFT +
    ((WIDTH - PAD_LEFT - PAD_RIGHT) * index) / Math.max(1, points.length - 1);
  const y = (value: number) =>
    PAD_TOP + (height - PAD_TOP - PAD_BOTTOM) * (1 - (value - lo) / span);

  const line = points
    .map((point, index) => `${x(index).toFixed(1)},${y(point.rate).toFixed(1)}`)
    .join(" ");

  // 날짜 눈금 — 양 끝만 보여 흐름을 읽기 어려웠다. 라벨 폭이 허락하는 만큼 사이 날짜도 넣는다.
  // '오늘' 라벨이 없는 차트라 todayIndex는 -1이다.
  const tickIndices = dateTickIndices(
    points.length,
    -1,
    labelMinGap(points.length),
  );
  const label = `${name ?? "대표 저수지"} 실제 저수율 흐름: 최근 ${String(points.length)}일 관측`;

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
      role="img"
      aria-label={label}
    >
      <polyline className={styles.actual} points={line} fill="none" />
      {tickIndices.map((index) => {
        const point = points[index];
        if (point === undefined) return null;
        const isFirst = index === 0;
        const isLast = index === points.length - 1;
        return (
          <text
            key={`reservoir-tick-${String(index)}`}
            className={styles.axisTick}
            data-testid={
              isFirst
                ? "reservoir-axis-start"
                : isLast
                  ? "reservoir-axis-end"
                  : undefined
            }
            x={isFirst ? PAD_LEFT : isLast ? WIDTH - PAD_RIGHT : x(index)}
            y={height - 9}
            textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
          >
            {formatMonthDay(point.observedOn)}
          </text>
        );
      })}
    </svg>
  );
}
