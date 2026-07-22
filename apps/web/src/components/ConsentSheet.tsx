"use client";

// 동의 바텀시트 — /regions 최초 진입 시 자동으로 열린다(consentVersion이 없을 때만).
// 필수 2건(위치기반 서비스·서비스 이용약관)을 모두 켜야 "동의하고 시작하기"가
// 활성화되고, 완료 시 consentVersion="consent-v1"을 기기(localStorage)에 저장한다.
// 필수 동의라 딤·Esc로는 닫지 않는다(BottomSheet onClose를 무시).

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadRegionStore, setConsent } from "../lib/client/region-store";
import styles from "./ConsentSheet.module.css";
import { BottomSheet } from "./ui/BottomSheet";
import { CtaButton } from "./ui/CtaButton";

export const CONSENT_VERSION = "consent-v1";

interface ConsentItem {
  key: "location" | "terms";
  label: string;
  href: string;
  linkLabel: string;
}

// 필수 동의 2건. 각 항목은 해당 폴리시 문서로 이동하는 링크를 함께 둔다.
const REQUIRED_ITEMS: ConsentItem[] = [
  {
    key: "location",
    label: "위치기반 서비스 이용 동의",
    href: "/policy/location",
    linkLabel: "위치기반 서비스 약관 보기",
  },
  {
    key: "terms",
    label: "서비스 이용약관 동의",
    href: "/policy/terms",
    linkLabel: "서비스 이용약관 보기",
  },
];

interface ConsentSheetProps {
  /** 동의가 저장된 뒤 호출한다(예: 시트를 연 화면의 갱신). */
  onConsented?: () => void;
}

export function ConsentSheet({ onConsented }: ConsentSheetProps) {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Record<ConsentItem["key"], boolean>>({
    location: false,
    terms: false,
  });

  // 최초 진입 판정은 마운트 후에만 가능하다(localStorage는 클라이언트 전용).
  useEffect(() => {
    if (loadRegionStore().consentVersion === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장소 값은 마운트 후에만 읽을 수 있다
      setOpen(true);
    }
  }, []);

  const allChecked = REQUIRED_ITEMS.every((item) => checks[item.key]);

  const toggleItem = (key: ConsentItem["key"]) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAll = () => {
    const next = !allChecked;
    setChecks({ location: next, terms: next });
  };

  const handleAgree = () => {
    if (!allChecked) {
      return;
    }
    setConsent(CONSENT_VERSION);
    setOpen(false);
    onConsented?.();
  };

  return (
    <BottomSheet
      open={open}
      label="약관 동의"
      // 필수 동의 — 딤/Esc로 닫히지 않도록 무시한다.
      onClose={() => undefined}
    >
      <h2 className={styles.title}>
        물시계를 시작하려면
        <br />
        동의가 필요해요
      </h2>
      <p className={styles.sub}>
        주소는 시군구와 대표 저수지를 정한 뒤에는 저장하지 않아요.
      </p>

      <button
        type="button"
        className={styles.agreeAll}
        aria-pressed={allChecked}
        onClick={toggleAll}
      >
        <span
          className={allChecked ? `${styles.check} ${styles.on}` : styles.check}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24">
            <path d="M5 12l5 5 9-10" />
          </svg>
        </span>
        모두 동의합니다
      </button>

      <ul className={styles.list}>
        {REQUIRED_ITEMS.map((item) => (
          <li key={item.key} className={styles.item}>
            <button
              type="button"
              className={styles.itemButton}
              aria-pressed={checks[item.key]}
              onClick={() => toggleItem(item.key)}
            >
              <span
                className={
                  checks[item.key]
                    ? `${styles.check} ${styles.on}`
                    : styles.check
                }
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              </span>
              <span className={styles.itemLabel}>{item.label}</span>
              <span className={styles.req}>필수</span>
            </button>
            <Link
              href={item.href}
              className={styles.docLink}
              aria-label={item.linkLabel}
            >
              보기
            </Link>
          </li>
        ))}
      </ul>

      <p className={styles.privacyRow}>
        <Link
          href="/policy/privacy"
          className={styles.privacyLink}
          aria-label="개인정보 처리방침 보기"
        >
          개인정보 처리방침
        </Link>
      </p>

      <CtaButton disabled={!allChecked} onClick={handleAgree}>
        동의하고 시작하기
      </CtaButton>
    </BottomSheet>
  );
}
