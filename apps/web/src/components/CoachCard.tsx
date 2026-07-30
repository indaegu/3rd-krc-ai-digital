// 수신호 코치 모듈 — 서버가 확정한 headline·summary·행동(최대 3개)을 그대로
// 보여준다(규칙 10). mode·fallbackReason은 표시 차이를 만들지 않는다(계약 주석).
// 자유 채팅/입력 UI는 절대 넣지 않는다(spec 15절). coach 실패 시 이 모듈만
// 오류 카드로 대체하고 다른 모듈에는 영향을 주지 않는다.
// 헤드라인은 파란 말풍선(꼬리), 행동은 번호 원(파랑)으로 — 레이아웃만 시안대로.

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
      {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 브랜드 아바타, 최적화 불필요 */}
      <img
        className={styles.face}
        src="/brand/coach_avatar.png"
        alt=""
        aria-hidden="true"
        width={51}
        height={51}
      />
      <span className={styles.title}>
        <h2 className={styles.name}>수신호 코치</h2>
        <span className={styles.sub}>우리 지역 수신호를 쉽게 알려드려요</span>
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
      // 종전에는 카드 전체가 aria-hidden이라 스크린리더 사용자는 아무 안내도 못 받았다.
      // 기다리는 중이라는 것은 오히려 꼭 읽어 줘야 하는 정보다.
      <Card className={styles.card} aria-busy="true">
        <CoachHeader />
        <div className={styles.loading} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingBody}>
            <b className={styles.loadingText}>
              수신호 코치가 안내를 만들고 있어요
            </b>
            {/* 처음 만드는 경우에만 오래 걸린다(같은 상황은 이후 저장해 두고 바로 보여준다). */}
            <span className={styles.loadingHint}>
              우리 지역 자료로 새로 쓰는 중이라 10초쯤 걸릴 수 있어요
            </span>
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
      <p className={styles.bubble}>{coach.headline}</p>
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
