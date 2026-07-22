import type { CSSProperties } from "react";

import styles from "./Skeleton.module.css";

interface SkeletonProps {
  /** CSS 크기 값. 예: "100%", "48px". */
  width?: string;
  height?: string;
  className?: string;
}

/** 모듈별 로딩 스켈레톤(shimmer 1.3s). 장식 요소라 보조기기에는 숨긴다. */
export function Skeleton({ width, height, className }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) {
    style.width = width;
  }
  if (height !== undefined) {
    style.height = height;
  }

  return (
    <span
      aria-hidden="true"
      className={
        className ? `${styles.skeleton} ${className}` : styles.skeleton
      }
      style={style}
    />
  );
}
