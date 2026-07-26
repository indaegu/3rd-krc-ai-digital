// 대표 저수지 실측 저수율 선 그래프 — 예측·밴드 없이 관측만 그린다.
// 지역 평년 대비(avgRatio)와 축·의미가 다르므로 겹쳐 그리지 않고 토글로만 바꿔 보여준다.
// 값은 서버 status.reservoir.rateHistory에서만 오고 여기서 만들지 않는다(규칙 10).

import type { StatusResponse } from "@mulsigye/contracts";

import styles from "./TrendChart.module.css";

const WIDTH = 640;
/** 기본 렌더 높이(px). 상세 화면은 height 프로퍼티로 키운다. */
const HEIGHT = 200;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

/** y축 위아래 여유(%p) — 선이 테두리에 붙지 않게 한다. */
const RANGE_PADDING = 3;

/** "YYYY-MM-DD" → "M/D". 파싱 실패 시 원문. */
function formatMonthDay(observedOn: string): string {
  const parts = observedOn.split("-");
  const m = parts[1];
  const d = parts[2];
  if (m === undefined || d === undefined) return observedOn;
  return `${String(Number(m))}/${String(Number(d))}`;
}

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

  const first = points[0];
  const last = points[points.length - 1];
  const label = `${name ?? "대표 저수지"} 실제 저수율 흐름: 최근 ${String(points.length)}일 관측`;

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
      role="img"
      aria-label={label}
    >
      <polyline className={styles.actual} points={line} fill="none" />
      {first === undefined ? null : (
        <text className={styles.axisTick} x={PAD_LEFT} y={height - 9}>
          {formatMonthDay(first.observedOn)}
        </text>
      )}
      {last === undefined ? null : (
        <text
          className={styles.axisTick}
          x={WIDTH - PAD_RIGHT}
          y={height - 9}
          textAnchor="end"
        >
          {formatMonthDay(last.observedOn)}
        </text>
      )}
    </svg>
  );
}
