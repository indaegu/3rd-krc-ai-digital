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
  const lastObservedOn = forecast.history.at(-1)?.observedOn;

  return (
    <Card>
      <div className={styles.head}>
        <div className={styles.titles}>
          <h2 className={styles.title}>지역 평년 대비 저수율</h2>
          <p className={styles.sub}>
            {/* 공표 자료(논가뭄지도)는 연 1회 갱신이라 마지막 실측일이 오늘이 아닐 수 있다.
                어느 날짜 기준인지 부제에 그대로 밝힌다(날짜는 서버 observedOn에서만 온다). */}
            {lastObservedOn === undefined ? null : `${lastObservedOn} 기준 · `}
            지난 {forecast.history.length}일과 앞으로 {forecast.forecast.length}
            일
          </p>
        </div>
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
      {/* 미니 차트에도 x축 날짜(첫 날짜·오늘·마지막 날짜)를 보여준다(#11 — 상세와 동일 showDates 경로). */}
      <TrendChart forecast={forecast} showDates />
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
