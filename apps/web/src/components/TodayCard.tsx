"use client";

// 오늘 우리 저수지 모듈 — 두 저수율을 분리해 보여준다(product.md).
// 게이지·큰 숫자 = 대표 저수지 원저수율 rate, 단계 칩 = 지역 avgRatio.

import type { StatusResponse } from "@mulsigye/contracts";
import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "../lib/client/reduced-motion";
import type { DroughtStageCode } from "../lib/data/drought-stage";
import { ReservoirGauge } from "./ReservoirGauge";
import styles from "./TodayCard.module.css";
import { Card } from "./ui/Card";
import { StageChip } from "./ui/StageChip";

const COUNT_UP_MS = 600;

/**
 * 단계별 검토 완료 헤드라인 상수. 카피 규칙(product.md): ~해요체·짧은 문장,
 * 예측을 사실로 단정하는 표현("내려가요/됩니다/위험합니다") 금지.
 */
const HEADLINE_BY_STAGE: Record<DroughtStageCode, string> = {
  ok: "물 사정이 넉넉해요",
  watch: "물이 평소보다 조금 부족해요",
  care: "물 부족이 이어지고 있어요",
  alert: "물 부족이 빠르게 진행 중이에요",
  crit: "물이 많이 부족한 상황이에요",
};

/** 만수위 참고(서버 확정 highWaterNotice)일 때의 헤드라인. */
const HIGH_WATER_HEADLINE = "비가 많아 물은 충분해요";

function formatRate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

interface TodayCardProps {
  status: StatusResponse;
}

export function TodayCard({ status }: TodayCardProps) {
  const rate = status.reservoir.rate;
  const numberRef = useRef<HTMLSpanElement>(null);

  // rate 카운트업(0.6s). reduced motion·rAF 없는 환경(jsdom)은 즉시 최종 값.
  useEffect(() => {
    const el = numberRef.current;
    if (el === null || rate === null) {
      return;
    }
    if (
      prefersReducedMotion() ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      el.textContent = formatRate(rate);
      return;
    }
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / COUNT_UP_MS, 1);
      el.textContent =
        progress < 1 ? String(Math.round(rate * progress)) : formatRate(rate);
      if (progress < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [rate]);

  const headline = status.highWaterNotice
    ? HIGH_WATER_HEADLINE
    : HEADLINE_BY_STAGE[status.region.officialStage.code];

  return (
    <Card>
      <h2 className={styles.eyebrow}>우리 지역 대표 저수지</h2>
      <div className={styles.hero}>
        <div className={styles.info}>
          <p className={styles.valueLabel}>현재 저수율</p>
          {rate === null ? (
            <p className={styles.noData}>관측값을 불러오지 못했어요</p>
          ) : (
            <p className={styles.rateLine}>
              <span ref={numberRef}>0</span>
              <span className={styles.rateUnit}>%</span>
            </p>
          )}
          <p className={styles.avg}>
            지역 평년 대비 <b>{status.region.avgRatio}%</b>
          </p>
          <div className={styles.chipRow}>
            <StageChip code={status.region.officialStage.code} />
          </div>
          <p className={styles.headline}>{headline}</p>
        </div>
        <ReservoirGauge rate={rate} />
      </div>
    </Card>
  );
}
