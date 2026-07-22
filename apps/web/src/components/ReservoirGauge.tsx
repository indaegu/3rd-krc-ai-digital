"use client";

// 메인 게이지 — 대표 저수지 원저수율(rate)만 보여준다(두 저수율 분리 원칙).
// 가뭄 단계 눈금을 겹치지 않는다: 단계 임계는 지역 avgRatio 기준이라 축이 다르다.
// 장식 요소라 aria-hidden — 수치·단계는 TodayCard가 텍스트로 제공한다.

import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "../lib/client/reduced-motion";
import styles from "./ReservoirGauge.module.css";

interface ReservoirGaugeProps {
  /** 대표 저수지 원저수율 %. null이면 물을 채우지 않는다. */
  rate: number | null;
}

export function ReservoirGauge({ rate }: ReservoirGaugeProps) {
  const gaugeRef = useRef<HTMLDivElement>(null);
  const waterRef = useRef<HTMLDivElement>(null);
  const target = rate === null ? 0 : Math.min(Math.max(rate, 0), 100);

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

  return (
    <div
      ref={gaugeRef}
      className={styles.gauge}
      data-motion="reduced"
      aria-hidden="true"
    >
      <div ref={waterRef} className={styles.water}>
        <span className={styles.wave} />
        <span className={`${styles.wave} ${styles.w2}`} />
      </div>
    </div>
  );
}
