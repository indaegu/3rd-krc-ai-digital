import {
  STAGE_LABEL_BY_CODE,
  type DroughtStageCode,
} from "../../lib/data/drought-stage";
import styles from "./StageChip.module.css";

interface StageChipProps {
  /** 공인 가뭄단계 code. 라벨·임계값의 단일 출처는 lib/data/drought-stage.ts다. */
  code: DroughtStageCode;
}

export function StageChip({ code }: StageChipProps) {
  return (
    <span className={`${styles.chip} ${styles[code]}`}>
      <strong className={styles.label}>{STAGE_LABEL_BY_CODE[code]}</strong>
      <span className={styles.caption}>지역 평년 대비 기준</span>
    </span>
  );
}
