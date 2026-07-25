"use client";

// 메인 게이지 — 지역 평년 대비 저수율(avgRatio)을 물 높이로 보여준다.
// 물 색은 파랑(#2D83FF) 고정이다(시안). 단계는 색으로 구분하지 않고, 수위 위치 +
// 우측 세로 스케일(정상/관심/주의/경계/심각) + 눈금선으로만 전달한다(접근성 규칙).
// 임계값은 클라이언트에 두지 않는다(규칙 10): 서버 stageBands를 그대로 소비하고,
// 값이 없으면 눈금 없이 채움만 그린다. 장식 요소라 aria-hidden — 수치·단계는 TodayCard가 제공한다.

import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "../lib/client/reduced-motion";
import type { DroughtStageCode } from "../lib/data/drought-stage";
import styles from "./ReservoirGauge.module.css";

/** 서버 stageBands 항목 형태(정상→심각). 임계값의 단일 출처는 서버 drought-stage다. */
interface StageBand {
  code: string;
  label: string;
  minRatio: number;
}

interface ReservoirGaugeProps {
  /** 평년 대비 저수율 %(0~100 스케일, 100 초과는 만수로 채움). null이면 물을 채우지 않는다. */
  avgRatio: number | null;
  /** 현재 공인 단계 code — 물색은 파랑 고정이므로 색을 정하지 않지만 계약상 유지한다. */
  stageCode: DroughtStageCode;
  /** 공인 단계 눈금(정상→심각). 없으면 눈금 없이 채움만 그린다(구 페이로드 폴백). */
  stageBands?: readonly StageBand[] | null;
}

export function ReservoirGauge({
  avgRatio,
  stageCode,
  stageBands,
}: ReservoirGaugeProps) {
  const gaugeRef = useRef<HTMLDivElement>(null);
  const waterRef = useRef<HTMLDivElement>(null);
  const target = avgRatio === null ? 0 : Math.min(Math.max(avgRatio, 0), 100);

  // 물 출렁임·수위 채움 애니메이션은 모션 허용일 때만 켠다. 마운트 후에 판정해
  // data-motion을 바꾸므로 SSR 기본값(reduced=정지)과 하이드레이션이 어긋나지 않는다.
  useEffect(() => {
    const gauge = gaugeRef.current;
    if (gauge !== null) {
      gauge.dataset.motion = prefersReducedMotion() ? "reduced" : "flowing";
    }
  }, []);

  useEffect(() => {
    const water = waterRef.current;
    if (water === null) {
      return;
    }
    // 수위 0 → 목표 채움. 1.6s 곡선은 data-motion="flowing"일 때만 transition으로
    // 애니메이션하고, reduced/정지에서는 즉시 목표 높이로 반영된다.
    water.style.height = "0%";
    void water.offsetHeight; // 리플로우로 시작 높이를 확정해 transition을 보장한다.
    water.style.height = `${target}%`;
  }, [target]);

  const bands = stageBands ?? null;

  return (
    <div
      ref={gaugeRef}
      className={styles.gauge}
      data-motion="reduced"
      data-stage={stageCode}
      aria-hidden="true"
    >
      <div className={styles.beaker}>
        <div ref={waterRef} className={styles.water} data-fill={target}>
          <span className={styles.wave} />
          <span className={`${styles.wave} ${styles.w2}`} />
        </div>
        {/* 단계 경계 눈금선(70/60/50/40) — 비이커 안에 옅게. */}
        {bands !== null && (
          <div className={styles.lines}>
            {bands
              .filter((band) => band.minRatio > 0 && band.minRatio < 100)
              .map((band) => (
                <span
                  key={`line-${band.code}`}
                  className={styles.zoneLine}
                  style={{ bottom: `${band.minRatio}%` }}
                />
              ))}
          </div>
        )}
      </div>
      {/* 우측 세로 단계 스케일(정상→심각) — 밴드 중앙 위치에 라벨. */}
      {bands !== null && (
        <div className={styles.scale}>
          {bands.map((band, index) => {
            // 상한 = 한 단계 위(정상 쪽) 밴드의 하한, 정상은 100. 라벨은 밴드 중앙에.
            const prev = bands[index - 1];
            const upper = prev === undefined ? 100 : prev.minRatio;
            const center = (band.minRatio + upper) / 2;
            return (
              <span
                key={`label-${band.code}`}
                className={styles.zoneLabel}
                style={{ bottom: `${center}%` }}
              >
                {band.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
