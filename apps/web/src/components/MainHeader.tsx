"use client";

// 메인 헤더 — 로고 탭 = 새로고침(rainfall 0.62s, 로고 회전 금지),
// 현재 지역 라벨 + [>] = 지역 설정 이동. 라벨은 응답 값으로만 표시한다.

import Link from "next/link";

import styles from "./MainHeader.module.css";

interface MainHeaderProps {
  /** "{시군명} · {대표 저수지명}". 아직 없으면 null. */
  regionLabel: string | null;
  /** true면 물방울 rainfall 애니메이션(로딩 중). */
  refreshing: boolean;
  onRefresh: () => void;
}

export function MainHeader({
  regionLabel,
  refreshing,
  onRefresh,
}: MainHeaderProps) {
  return (
    <header className={styles.header}>
      <button
        type="button"
        aria-label="새로고침"
        className={
          refreshing
            ? `${styles.logoButton} ${styles.raining}`
            : styles.logoButton
        }
        onClick={onRefresh}
      >
        <span className={styles.drop} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 2C12 2 5 10.2 5 15a7 7 0 0 0 14 0C19 10.2 12 2 12 2Z" />
          </svg>
        </span>
        <span className={styles.logoText}>물시계</span>
      </button>
      <Link
        href="/regions"
        className={styles.regionLink}
        aria-label="지역 설정"
      >
        <span className={styles.regionLabel}>{regionLabel ?? "우리 지역"}</span>
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </header>
  );
}
