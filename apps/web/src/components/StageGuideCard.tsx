import type { ForecastResponse } from "@mulsigye/contracts";

import {
  DROUGHT_STAGE_THRESHOLDS,
  STAGE_LABEL_BY_CODE,
  type DroughtStageCode,
} from "../lib/data/drought-stage";
import { Card } from "./ui/Card";
import styles from "./StageGuideCard.module.css";

/**
 * 단계별 행동 가이드 — 서버 forecast.stageGuide(5단계 ok→crit)를 렌더한다.
 * 각 단계의 권장 행동 제목은 서버 행동 카탈로그가 유일 출처이며(카피 복제 금지),
 * 우리 지역 현재 단계에 "지금 우리 지역" 표시를 강조한다.
 *
 * stageGuide가 없는 구 페이로드에서는 기존 "가뭄 단계 기준" 표로 폴백한다.
 */
export function StageGuideCard({
  stageGuide,
}: {
  stageGuide: ForecastResponse["stageGuide"];
}) {
  if (stageGuide === undefined || stageGuide.length === 0) {
    return <StageGuideFallback />;
  }
  return (
    <Card>
      <h2 className={styles.sectionTitle}>단계별 행동 가이드</h2>
      <ul className={styles.guide}>
        {stageGuide.map((stage) => (
          <li
            key={stage.code}
            className={`${styles.stageRow} ${stage.current ? styles.current : ""}`}
          >
            <div className={styles.stageHead}>
              <span className={`${styles.chip} ${styles[stage.code]}`}>
                {stage.label}
              </span>
              {stage.current ? (
                <span className={styles.currentMark}>지금 우리 지역</span>
              ) : null}
            </div>
            <ul className={styles.actions}>
              {stage.actions.map((action) => (
                <li key={action} className={styles.actionItem}>
                  {action}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * 폴백 표 — 서버 stageGuide가 없을 때만 쓰는 기존 5단계 기준.
 * 임계값 문구는 하드코딩하지 않고 drought-stage 단일 출처에서 조립한다.
 */
const FALLBACK_GUIDE: ReadonlyArray<{
  code: DroughtStageCode;
  range: string;
  action: string;
}> = [
  {
    code: "ok",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.ok}% 초과`,
    action: "평소처럼 관리하면 돼요",
  },
  {
    code: "watch",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.ok}% 이하`,
    action: "물 사용을 조금씩 아껴요",
  },
  {
    code: "care",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.watch}% 이하`,
    action: "공동 급수 일정을 확인해요",
  },
  {
    code: "alert",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.care}% 이하`,
    action: "제한급수·대체수원을 준비해요",
  },
  {
    code: "crit",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.alert}% 이하`,
    action: "관계기관 안내에 따라요",
  },
];

function StageGuideFallback() {
  return (
    <Card>
      <h2 className={styles.sectionTitle}>가뭄 단계 기준</h2>
      <ul className={styles.fallback}>
        {FALLBACK_GUIDE.map((stage) => (
          <li key={stage.code} className={styles.fallbackRow}>
            <span className={`${styles.chip} ${styles[stage.code]}`}>
              {STAGE_LABEL_BY_CODE[stage.code]}
            </span>
            <span className={styles.fallbackBody}>
              <b className={styles.fallbackRange}>{stage.range}</b>
              <small className={styles.fallbackAction}>{stage.action}</small>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
