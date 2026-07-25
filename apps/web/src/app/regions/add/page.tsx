"use client";

// 지역 추가 — 도로명주소 검색 → 시군구 확정 → 대표 저수지 확인 → 등록.

import Link from "next/link";

import { AddressSearch } from "../../../components/AddressSearch";
import styles from "./page.module.css";

export default function RegionAddPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link
          href="/regions"
          className={styles.back}
          aria-label="지역 설정으로 돌아가기"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className={styles.title}>
          우리 지역을 등록하면{"\n"}수신호를 알려드려요.
        </h1>
        <p className={styles.subtitle}>
          도로명 주소를 검색해서 우리 지역을 등록해 주세요.
        </p>
      </header>
      <AddressSearch />
    </main>
  );
}
