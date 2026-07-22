// 물시계 코치 모듈 — 서버가 확정한 headline·summary·행동(최대 3개)을 그대로
// 보여준다(규칙 10). mode·fallbackReason은 표시 차이를 만들지 않는다(계약 주석).
// 자유 채팅/입력 UI는 절대 넣지 않는다(spec 15절). coach 실패 시 이 모듈만
// 오류 카드로 대체하고 다른 모듈에는 영향을 주지 않는다.

import type { CoachResponse } from "@mulsigye/contracts";

import styles from "./CoachCard.module.css";
import { Card } from "./ui/Card";
import { CtaButton } from "./ui/CtaButton";

/** 화면에 보여줄 행동 최대 개수(product.md: 행동 추천 3개 이하). */
const MAX_ACTIONS = 3;

export type CoachCardState =
  | { kind: "loading" }
  | { kind: "ready"; data: CoachResponse }
  | { kind: "error"; message: string; retryable: boolean };

interface CoachCardProps {
  state: CoachCardState;
  onRetry?: () => void;
}

function CoachHeader() {
  return (
    <div className={styles.who}>
      <span className={styles.face} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2C12 2 5 10.2 5 15a7 7 0 0 0 14 0C19 10.2 12 2 12 2Z" />
        </svg>
      </span>
      <span className={styles.title}>
        <h2 className={styles.name}>물시계 코치</h2>
        <span className={styles.sub}>우리 지역 물 사정을 쉬운 말로</span>
      </span>
    </div>
  );
}

export function CoachCard({ state, onRetry }: CoachCardProps) {
  if (state.kind === "error") {
    // 코치 모듈만 오류 카드로 대체한다. 채팅/입력 암시 UI는 두지 않는다.
    return (
      <Card className={styles.card} aria-live="polite">
        <CoachHeader />
        <p className={styles.errorMessage}>{state.message}</p>
        {state.retryable && onRetry ? (
          <CtaButton onClick={onRetry}>다시 시도하기</CtaButton>
        ) : null}
      </Card>
    );
  }

  if (state.kind === "loading") {
    return (
      <Card className={styles.card} aria-hidden="true">
        <CoachHeader />
        <div className={styles.loading}>
          <span className={styles.loadingText}>
            코치가 설명을 준비하고 있어요…
          </span>
        </div>
      </Card>
    );
  }

  const { coach } = state.data;
  const actions = coach.actions.slice(0, MAX_ACTIONS);

  return (
    <Card className={styles.card}>
      <CoachHeader />
      <p className={styles.headline}>{coach.headline}</p>
      <p className={styles.summary}>{coach.summary}</p>
      <ol className={styles.actions}>
        {actions.map((action, index) => (
          <li key={action.id} className={styles.action}>
            <span className={styles.num} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.actionBody}>
              <b className={styles.actionTitle}>{action.title}</b>
              <span className={styles.actionReason}>{action.reason}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
