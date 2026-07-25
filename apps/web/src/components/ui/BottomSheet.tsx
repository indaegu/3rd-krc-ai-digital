"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import styles from "./BottomSheet.module.css";

interface BottomSheetProps {
  open: boolean;
  /** 다이얼로그의 접근 가능한 이름. */
  label: string;
  /** Esc·딤 클릭 시 호출. 닫기를 막아야 하면(예: 필수 동의) 호출부에서 무시한다. */
  onClose: () => void;
  /** 딤(스크림)에 덧입힐 클래스. 필수 시트가 뒤 화면을 진하게 가리고 흐릴 때 쓴다(#5). */
  dimClassName?: string | undefined;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({
  open,
  label,
  onClose,
  dimClassName,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    restoreRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    sheetRef.current?.focus();
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    // 포커스 트랩: Tab 순환을 시트 내부로 가둔다.
    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }
    const focusables = Array.from(
      sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey) {
      if (
        document.activeElement === first ||
        document.activeElement === sheet
      ) {
        event.preventDefault();
        last?.focus();
      }
      return;
    }
    if (document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className={styles.overlay}>
      <div
        className={dimClassName ? `${styles.dim} ${dimClassName}` : styles.dim}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={styles.sheet}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.grabber} aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
