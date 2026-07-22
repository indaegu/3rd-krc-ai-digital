// 근거·한계 고지 모듈 — "이 화면의 근거". 공인 단계 기준(평년 대비 70/60/50/40%)과
// 공식 우선 원칙을 알리고, 응답의 sources를 칩으로 그대로 보여준다.
// 임계값은 lib/data/drought-stage.ts 단일 출처에서만 가져온다(규칙 5, UI 복제 금지).
// stale이면 화면 구조는 그대로 두고 지연 안내 문구만 덧붙인다(mode·stale로 구조 불변).

import { DROUGHT_STAGE_THRESHOLDS } from "../lib/data/drought-stage";
import styles from "./SourcesCard.module.css";
import { Card } from "./ui/Card";

/** "70·60·50·40" — 임계값을 하드코딩하지 않고 단일 출처에서 조립한다. */
const STAGE_THRESHOLD_TEXT = [
  DROUGHT_STAGE_THRESHOLDS.ok,
  DROUGHT_STAGE_THRESHOLDS.watch,
  DROUGHT_STAGE_THRESHOLDS.care,
  DROUGHT_STAGE_THRESHOLDS.alert,
].join("·");

interface SourcesCardProps {
  sources: string[];
  stale: boolean;
}

export function SourcesCard({ sources, stale }: SourcesCardProps) {
  return (
    <Card className={styles.card}>
      <h2 className={styles.title}>이 화면의 근거</h2>
      <p className={styles.body}>
        가뭄 단계는 농어촌공사 공인 기준(평년 대비 {STAGE_THRESHOLD_TEXT}%)을
        그대로 써요. ‘며칠 뒤’ 예측은 참고용이며, 공식 가뭄 예·경보가 항상
        우선이에요.
      </p>
      {stale ? (
        <p className={styles.stale}>
          일부 공공데이터가 지연되어, 마지막으로 받은 값을 보여주고 있어요.
        </p>
      ) : null}
      {sources.length > 0 ? (
        <ul className={styles.chips}>
          {sources.map((source) => (
            <li key={source} className={styles.chip}>
              {source}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
