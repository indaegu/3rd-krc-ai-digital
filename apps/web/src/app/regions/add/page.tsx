"use client";

// 지역 추가 — 두 가지 길을 준다.
//   ① 도로명주소 검색 → 시군구 확정 → 대표 저수지 확인 → 등록
//   ② 저수지 이름 검색 → 그 저수지로 바로 등록
// 넓은 시군에서는 주소만으로 원하는 저수지가 잡히지 않아(실측: 제주시 5곳) ②가 필요하다.

import Link from "next/link";
import { useState } from "react";

import { AddressSearch } from "../../../components/AddressSearch";
import { ReservoirSearch } from "../../../components/ReservoirSearch";
import searchStyles from "../../../components/AddressSearch.module.css";
import styles from "./page.module.css";

type Mode = "address" | "reservoir";

export default function RegionAddPage() {
  const [mode, setMode] = useState<Mode>("address");

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
          {mode === "address"
            ? "도로명 주소를 검색해서 우리 지역을 등록해 주세요."
            : "알고 있는 저수지 이름으로 바로 등록할 수 있어요."}
        </p>
      </header>

      <div
        className={searchStyles.modeToggle}
        role="group"
        aria-label="검색 방식 선택"
      >
        <button
          type="button"
          className={searchStyles.modeButton}
          aria-pressed={mode === "address"}
          onClick={() => {
            setMode("address");
          }}
        >
          주소로 찾기
        </button>
        <button
          type="button"
          className={searchStyles.modeButton}
          aria-pressed={mode === "reservoir"}
          onClick={() => {
            setMode("reservoir");
          }}
        >
          저수지 이름으로 찾기
        </button>
      </div>

      {mode === "address" ? <AddressSearch /> : <ReservoirSearch />}
    </main>
  );
}
