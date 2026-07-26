"use client";

// '저수율 흐름' 모듈 — 메인용 차트 카드. 제목·범례 + "자세히" → /trend.
// 그래프 제목·대체 텍스트에 "지역 평년 대비 저수율"을 명시한다(design-system.md).
//
// 지표 토글 3종(product.md): **① 지역 평년 대비 예측**(기본) · ② 저수지 실측 ·
// ③ 함께 보기. ③은 ①의 예측선·밴드를 그대로 두고 저수지 실측을 **오른쪽 축**에 참고선으로
// 얹는다 — 두 값은 축·의미가 달라(원저수율 % vs 평년 대비 %) 같은 축에 겹치지 않는다.
// 새 예측 모델을 만들지 않는다: 예측은 백테스트로 채택한 지역 모델 하나뿐이다(규칙 3).

import type { ForecastResponse, StatusResponse } from "@mulsigye/contracts";
import Link from "next/link";
import { useState } from "react";

import { ReservoirRateChart } from "./ReservoirRateChart";
import { TrendChart } from "./TrendChart";
import styles from "./TrendChartCard.module.css";
import { Card } from "./ui/Card";

type ChartMode = "region" | "reservoir" | "both";

interface TrendChartCardProps {
  forecast: ForecastResponse;
  /** 대표 저수지 실측 시계열(status.reservoir.rateHistory). 없으면 토글을 숨긴다. */
  reservoirHistory?: StatusResponse["reservoir"]["rateHistory"];
  /** 대표 저수지 이름 — 토글 설명에 쓴다. */
  reservoirName?: string | undefined;
}

export function TrendChartCard({
  forecast,
  reservoirHistory,
  reservoirName,
}: TrendChartCardProps) {
  const [mode, setMode] = useState<ChartMode>("region");
  const lastObservedOn = forecast.history.at(-1)?.observedOn;
  const rates = reservoirHistory ?? [];
  // 점이 2개는 있어야 선으로 의미가 있다.
  const canToggle = rates.length >= 2;
  const showReservoir = canToggle && mode === "reservoir";
  const showBoth = canToggle && mode === "both";

  return (
    <Card>
      <div className={styles.head}>
        <div className={styles.titles}>
          <h2 className={styles.title}>
            {showReservoir
              ? "저수지 실제 저수율"
              : showBoth
                ? "지역 평년 대비 + 저수지 실측"
                : "지역 평년 대비 저수율"}
          </h2>
          <p className={styles.sub}>
            {showReservoir
              ? `${reservoirName ?? "대표 저수지"} · 최근 ${String(rates.length)}일 실측`
              : showBoth
                ? `예측은 지역 평년 대비 기준 · ${reservoirName ?? "대표 저수지"} 실측은 오른쪽 눈금`
                : /* 공표 자료(논가뭄지도)는 연 1회 갱신이라 마지막 실측일이 오늘이 아닐 수 있다.
                     어느 날짜 기준인지 부제에 그대로 밝힌다(날짜는 서버 observedOn에서만 온다). */
                  `${lastObservedOn === undefined ? "" : `${lastObservedOn} 기준 · `}지난 ${String(forecast.history.length)}일과 앞으로 ${String(forecast.forecast.length)}일`}
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

      {canToggle ? (
        <div className={styles.toggle} role="group" aria-label="차트 지표 선택">
          <button
            type="button"
            className={styles.toggleButton}
            aria-pressed={mode === "region"}
            onClick={() => setMode("region")}
          >
            지역 평년 대비
          </button>
          <button
            type="button"
            className={styles.toggleButton}
            aria-pressed={mode === "reservoir"}
            onClick={() => setMode("reservoir")}
          >
            저수지 실측
          </button>
          <button
            type="button"
            className={styles.toggleButton}
            aria-pressed={mode === "both"}
            onClick={() => setMode("both")}
          >
            함께 보기
          </button>
        </div>
      ) : null}

      {showReservoir ? (
        <ReservoirRateChart history={rates} name={reservoirName} />
      ) : (
        /* 미니 차트에도 x축 날짜를 보여준다(#11 — 상세와 동일 showDates 경로). */
        <TrendChart
          forecast={forecast}
          showDates
          {...(showBoth
            ? { reservoirHistory: rates, reservoirName: reservoirName }
            : {})}
        />
      )}

      <ul className={styles.legend} aria-label="차트 범례">
        {showReservoir ? (
          <li>
            <i className={styles.legendSolid} aria-hidden="true" />
            실측 저수율
          </li>
        ) : (
          <>
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
            {showBoth ? (
              <li>
                <i className={styles.legendReservoir} aria-hidden="true" />
                저수지 실측(오른쪽 눈금)
              </li>
            ) : null}
          </>
        )}
      </ul>
    </Card>
  );
}
