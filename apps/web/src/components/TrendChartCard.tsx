// '저수율 흐름' 모듈 — 메인용 차트 카드. 제목·범례 + "자세히" → /trend.
// 그래프 제목·대체 텍스트에 "지역 평년 대비 저수율"을 명시한다(design-system.md).

import type { ForecastResponse } from "@mulsigye/contracts";
import Link from "next/link";

import { TrendChart } from "./TrendChart";
import styles from "./TrendChartCard.module.css";
import { Card } from "./ui/Card";

interface TrendChartCardProps {
  forecast: ForecastResponse;
}

export function TrendChartCard({ forecast }: TrendChartCardProps) {
  return (
    <Card>
      <div className={styles.head}>
        <h2 className={styles.eyebrow}>
          지역 평년 대비 저수율 · 지난 {forecast.history.length}일과 앞으로{" "}
          {forecast.forecast.length}일
        </h2>
        <Link href="/trend" className={styles.moreLink}>
          자세히
          <svg
            className={styles.chevron}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
      <TrendChart forecast={forecast} />
      <ul className={styles.legend} aria-label="차트 범례">
        <li>
          <i className={styles.legendSolid} aria-hidden="true" />
          실측
        </li>
        <li>
          <i className={styles.legendDash} aria-hidden="true" />
          예측
        </li>
        <li>
          <i className={styles.legendBand} aria-hidden="true" />
          불확실 구간
        </li>
      </ul>
    </Card>
  );
}
