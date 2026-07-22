"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";

import styles from "./CtaButton.module.css";

interface CtaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 진행 중 잠금. 클릭을 무시하고 내부 스피너를 표시한다(중복 입력 방지). */
  busy?: boolean;
}

export function CtaButton({
  busy = false,
  className,
  children,
  onClick,
  type,
  ...rest
}: CtaButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={className ? `${styles.button} ${className}` : styles.button}
      aria-busy={busy}
      aria-disabled={busy || undefined}
      onClick={handleClick}
    >
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
