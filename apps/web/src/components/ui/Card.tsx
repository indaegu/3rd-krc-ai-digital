import type { HTMLAttributes } from "react";

import styles from "./Card.module.css";

type CardProps = HTMLAttributes<HTMLElement>;

/** 메인 모듈 공통 카드. 모듈 간 간격(24px)은 페이지 레이아웃이 소유한다. */
export function Card({ className, ...rest }: CardProps) {
  return (
    <section
      {...rest}
      className={className ? `${styles.card} ${className}` : styles.card}
    />
  );
}
