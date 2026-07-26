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
  /** 현재 공인 단계 코드(status). 도달 예정 단계가 없을 때 무엇을 보여줄지 가른다. */
  currentStageCode?: string | undefined;
}

/**
 * 도달 예정 단계가 없을 때의 문구. 이미 가장 낮은 단계(심각)면 '다음 단계'가 없어 reach가
 * 비어 오는데, 이때 "안정"이라고 하면 계속 낮아지는 지역을 안심시키는 오해가 생긴다.
 * 그래서 현재 단계·관측 추세로 문구를 가른다.
 */
function noReachCopy(
  currentStageCode: string | undefined,
  falling: boolean,
): { headline: string; detail: string } {
  if (currentStageCode === "crit") {
    return falling
      ? {
          headline: "심각 지속",
          detail: "이미 가장 낮은 단계이고, 최근 저수율이 계속 낮아지고 있어요",
        }
      : {
          headline: "심각 유지",
          detail: "이미 가장 낮은 단계예요. 최근 큰 변화는 없어요",
        };
  }
  if (falling) {
    return {
      headline: "천천히 감소",
      detail:
        "낮아지는 중이지만 30일 안에 다음 단계까지 내려가지는 않을 것으로 보여요",
    };
  }
  return {
    headline: "안정",
    detail: "당분간 물 사정이 안정적으로 유지될 것으로 보여요",
  };
}

export function ReachCard({ forecast, currentStageCode }: ReachCardProps) {
  const { reach, model, trend } = forecast;
  const reachable = reach.days !== null && reach.targetStage !== null;
  const noReach = noReachCopy(currentStageCode, trend.bucket === "falling");

  return (
    <Card>
      <h2 className={styles.eyebrow}>이 추세라면</h2>
      {reachable ? (
        <>
          <p
            className={styles.big}
            data-stage={reach.targetStage?.code ?? "ok"}
          >
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
          <p className={styles.big} data-stage={currentStageCode ?? "ok"}>
            {noReach.headline}
          </p>
          <p className={styles.desc}>{noReach.detail}</p>
        </>
      )}
      <p className={styles.caption}>
        그동안 예측은 실제와 7일 ±{formatMae(model.mae7)}%p · 14일 ±
        {formatMae(model.mae14)}%p 정도 차이 났어요
      </p>
    </Card>
  );
}
