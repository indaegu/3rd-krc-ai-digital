// '감소 주의' 조기경보 배너 — 서버가 확정한 forecast.earlyWarning이 있을 때만 표시.
// 공식 가뭄 단계 칩과 별개인 앱 자체 '참고 신호'다(공식 70/60/50/40 기준이 아님).
// 위험 체계(단계 칩)와 혼동되지 않게 amber/watch 톤으로 분리하고 문구는 서버 message를 쓴다.

import type { ForecastResponse } from "@mulsigye/contracts";

import styles from "./EarlyWarningBanner.module.css";

interface EarlyWarningBannerProps {
  earlyWarning: ForecastResponse["earlyWarning"];
}

export function EarlyWarningBanner({ earlyWarning }: EarlyWarningBannerProps) {
  if (earlyWarning == null) {
    return null;
  }
  return (
    <p className={styles.banner} aria-live="polite">
      <strong className={styles.tag}>참고 조기경보</strong> ·{" "}
      {earlyWarning.message}
    </p>
  );
}
