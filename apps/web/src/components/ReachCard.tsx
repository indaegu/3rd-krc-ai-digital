// '이 추세라면' 모듈 — 다음 공인 단계 도달 예상. 도달일·대상 단계는 서버가
// 확정한 reach 값을 그대로 보여준다(규칙 10). 카피는 참고 표현만 쓴다(규칙 3):
// "지금 추세가 이어지면 N일 뒤 '단계'에 들어설 가능성이 있어요."

import type { ForecastResponse } from "@mulsigye/contracts";

import styles from "./ReachCard.module.css";
import { Card } from "./ui/Card";

/** MAE %p 표시 형식 — model 메타 실값을 소수 1자리로. 하드코딩 금지. */
function formatMae(value: number): string {
  return value.toFixed(1);
}

interface ReachCardProps {
  forecast: ForecastResponse;
}

export function ReachCard({ forecast }: ReachCardProps) {
  const { reach, model } = forecast;
  const reachable = reach.days !== null && reach.targetStage !== null;

  return (
    <Card>
      <h2 className={styles.eyebrow}>이 추세라면</h2>
      {reachable ? (
        <>
          <p className={styles.big}>
            {reach.days}
            <span className={styles.suffix}>일 뒤</span>
          </p>
          <p className={styles.desc}>
            지금 추세가 이어지면 ‘{reach.targetStage?.label}’ 단계에 들어설
            가능성이 있어요
          </p>
        </>
      ) : (
        <>
          <p className={styles.big}>안정</p>
          <p className={styles.desc}>
            당분간 물 사정이 안정적으로 유지될 것으로 보여요
          </p>
        </>
      )}
      <p className={styles.caption}>
        예측 오차(백테스트): 7일 ±{formatMae(model.mae7)}%p · 14일 ±
        {formatMae(model.mae14)}%p 수준이에요
      </p>
    </Card>
  );
}
