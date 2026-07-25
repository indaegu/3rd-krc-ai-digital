"use client";

// 스플래시 — 메인 최초 진입 시 1.5s 오버레이(로고 등장). 게이팅과 별개로
// consent·지역이 모두 있을 때 메인 위에 잠깐 덮는다. prefers-reduced-motion이면
// 대기 없이 즉시 통과시켜 장식 모션을 만들지 않는다(design-system 접근성 규칙).

import { useEffect } from "react";

import { prefersReducedMotion } from "../lib/client/reduced-motion";
import styles from "./Splash.module.css";

const SPLASH_MS = 1500;

interface SplashProps {
  /** 대기가 끝나면(또는 reduced-motion이면 즉시) 호출한다. */
  onDone: () => void;
}

export function Splash({ onDone }: SplashProps) {
  useEffect(() => {
    if (prefersReducedMotion()) {
      onDone();
      return;
    }
    const timer = setTimeout(onDone, SPLASH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [onDone]);

  return (
    <div className={styles.overlay} role="status" aria-label="수신호를 여는 중">
      <p className={styles.tagline}>물의 내일을 먼저 알리다</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 브랜드 로고, 최적화 불필요 */}
      <img
        className={styles.logo}
        src="/brand/logo.svg"
        alt="수신호"
        width={170}
        height={46}
      />
    </div>
  );
}
