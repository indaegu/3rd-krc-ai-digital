// 만수위 '참고' 배너 — 서버가 확정한 status.highWaterNotice가 true일 때만 표시.
// 클라이언트는 95%·상승 추세를 재판정하지 않는다(자체 임계값 복제 금지).
// '경보/경고'라 부르지 않고, 홍수 안내는 공식 재난 문자로 위임한다(product.md).

import styles from "./HighWaterBanner.module.css";

interface HighWaterBannerProps {
  notice: boolean;
}

export function HighWaterBanner({ notice }: HighWaterBannerProps) {
  if (!notice) {
    return null;
  }
  return (
    <p className={styles.banner}>
      <strong className={styles.tag}>참고</strong> · 최근 비로 저수율이 만수위에
      가까워요. 방류·하류 안내는 공식 재난 문자를 확인해 주세요.
    </p>
  );
}
