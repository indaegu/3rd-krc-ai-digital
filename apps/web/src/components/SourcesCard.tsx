// 근거·한계 고지 모듈 — "이 정보는 어디서 왔나요". 공인 단계 기준(평년 대비 70/60/50/40%)과
// 공식 우선 원칙을 알리고, 응답의 sources를 칩으로 그대로 보여준다.
// 임계값은 lib/data/drought-stage.ts 단일 출처에서만 가져온다(규칙 5, UI 복제 금지).
// stale이면 화면 구조는 그대로 두고 지연 안내 문구만 덧붙인다(mode·stale로 구조 불변).

import type { StatusResponse } from "@mulsigye/contracts";

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
  /** 추정으로 계산한 날이면 서버가 준 근거(오차·저수지 수). 공표값이면 null. */
  estimate?: NonNullable<StatusResponse["region"]["estimate"]> | null;
}

export function SourcesCard({ sources, stale, estimate }: SourcesCardProps) {
  return (
    <Card className={styles.card}>
      <h2 className={styles.title}>이 정보는 어디서 왔나요</h2>
      <p className={styles.body}>
        가뭄 단계는 농어촌공사 공인 기준(평년 대비 {STAGE_THRESHOLD_TEXT}%)을
        그대로 써요. ‘며칠 뒤’ 예측은 참고용이며, 공식 가뭄 예·경보가 항상
        우선이에요.
      </p>
      {estimate != null ? (
        <p className={styles.estimate}>
          공표 자료가 아직 없는 날이라, 우리 지역 저수지{" "}
          {estimate.reservoirCount}곳의 실제 측정값을 모아 계산한 추정값이에요.
          지난해 자료로 맞춰 본 오차는 평균 {estimate.maePp.toFixed(1)}%p였고,
          단계 기준({STAGE_THRESHOLD_TEXT}%)은 공인 기준 그대로예요.
        </p>
      ) : null}
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
