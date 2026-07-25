"use client";

// 오늘 우리 저수지 모듈 — 두 저수율을 분리해 보여준다(product.md).
// 게이지·큰 숫자 = 지역 평년 대비 avgRatio(단계 스케일과 같은 축), 원저수율 rate는 보조 줄.
// 카드 좌상단 탭 라벨은 대표 저수지명(서버값), 그 아래 "평년 대비 {단계}"(단계는 fg색 텍스트).

import type { StatusResponse } from "@mulsigye/contracts";
import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "../lib/client/reduced-motion";
import type { DroughtStageCode } from "../lib/data/drought-stage";
import { ReservoirGauge } from "./ReservoirGauge";
import styles from "./TodayCard.module.css";
import { Card } from "./ui/Card";

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

/**
 * 올해 흐름 속 현재 위치 카피(서버 확정 yearlyPosition.bucket). 웹·안드로이드 공통 SSOT.
 * 두 줄: 주 문장 + 보조 세부. ~해요체·짧은 문장, 예측 단정 표현 금지.
 */
type YearlyBucket = NonNullable<StatusResponse["yearlyPosition"]>["bucket"];

const YEARLY_HEADLINE_BY_BUCKET: Record<YearlyBucket, string> = {
  low: "올해 흐름 속 낮은 편이에요",
  mid: "올해 흐름 속 보통 수준이에요",
  high: "올해 흐름 속 높은 편이에요",
};

/** 보조 세부 문구. low는 하위 N%, high는 상위 100-N%, mid는 중간. */
function yearlyDetail(bucket: YearlyBucket, percentile: number): string {
  if (bucket === "low") return `올해 저수율 중 하위 ${percentile}%`;
  if (bucket === "high") return `올해 저수율 중 상위 ${100 - percentile}%`;
  return "올해 저수율 중 중간";
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

interface TodayCardProps {
  status: StatusResponse;
}

export function TodayCard({ status }: TodayCardProps) {
  const rate = status.reservoir.rate;
  const avgRatio = status.region.avgRatio;
  const stage = status.region.officialStage;
  const stageCode = stage.code;
  const numberRef = useRef<HTMLSpanElement>(null);

  // 평년 대비(avgRatio) 카운트업(0.6s). reduced motion·rAF 없는 환경(jsdom)은 즉시 최종 값.
  useEffect(() => {
    const el = numberRef.current;
    if (el === null) {
      return;
    }
    if (
      prefersReducedMotion() ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      el.textContent = formatRate(avgRatio);
      return;
    }
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / COUNT_UP_MS, 1);
      el.textContent =
        progress < 1
          ? String(Math.round(avgRatio * progress))
          : formatRate(avgRatio);
      if (progress < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [avgRatio]);

  const headline = status.highWaterNotice
    ? HIGH_WATER_HEADLINE
    : HEADLINE_BY_STAGE[stageCode];

  const yearly = status.yearlyPosition;

  return (
    <Card className={styles.card}>
      <span className={styles.tab}>{status.reservoir.name}</span>
      <div className={styles.hero}>
        <div className={styles.info}>
          <p className={styles.valueLabel}>
            평년 대비{" "}
            <b className={styles.stage} data-stage={stageCode}>
              {stage.label}
            </b>
          </p>
          <p className={styles.rateLine}>
            <span ref={numberRef}>0</span>
            <span className={styles.rateUnit}>%</span>
          </p>
          <div className={styles.block}>
            <p className={styles.headline}>{headline}</p>
            {rate === null ? (
              <p className={styles.secondary}>
                저수지 실제 저수율은 아직 없어요
              </p>
            ) : (
              <p className={styles.secondary}>
                저수지 실제 저수율은 <b>{formatRate(rate)}</b>%예요
              </p>
            )}
          </div>
          {yearly != null && (
            <div className={styles.block}>
              <p className={styles.yearlyHeadline}>
                {YEARLY_HEADLINE_BY_BUCKET[yearly.bucket]}
              </p>
              <p className={styles.yearlyDetail}>
                {yearlyDetail(yearly.bucket, yearly.percentile)}
              </p>
            </div>
          )}
        </div>
        <div className={styles.gaugeCol}>
          <ReservoirGauge
            avgRatio={avgRatio}
            stageCode={stageCode}
            stageBands={status.stageBands ?? null}
          />
        </div>
      </div>
    </Card>
  );
}
