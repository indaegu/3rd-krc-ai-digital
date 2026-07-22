"use client";

// 메인 게이지 — 대표 저수지 원저수율(rate)만 보여준다(두 저수율 분리 원칙).
// 가뭄 단계 눈금을 겹치지 않는다: 단계 임계는 지역 avgRatio 기준이라 축이 다르다.
// 장식 요소라 aria-hidden — 수치·단계는 TodayCard가 텍스트로 제공한다.

import { useEffect, useRef } from "react";

import styles from "./ReservoirGauge.module.css";

interface ReservoirGaugeProps {
  /** 대표 저수지 원저수율 %. null이면 물을 채우지 않는다. */
  rate: number | null;
}

export function ReservoirGauge({ rate }: ReservoirGaugeProps) {
  const waterRef = useRef<HTMLDivElement>(null);
  const target = rate === null ? 0 : Math.min(Math.max(rate, 0), 100);

  useEffect(() => {
    const water = waterRef.current;
    if (water === null) {
      return;
    }
    // 수위 0 → 목표 채움. 1.6s 곡선은 CSS transition이 소유하고,
    // reduced motion에서는 전역 규칙이 transition을 끊어 즉시 반영된다.
    water.style.height = "0%";
    void water.offsetHeight; // 리플로우로 시작 높이를 확정해 transition을 보장한다.
    water.style.height = `${target}%`;
  }, [target]);

  return (
    <div className={styles.gauge} aria-hidden="true">
      <div ref={waterRef} className={styles.water}>
        <span className={styles.wave} />
        <span className={`${styles.wave} ${styles.w2}`} />
      </div>
    </div>
  );
}
