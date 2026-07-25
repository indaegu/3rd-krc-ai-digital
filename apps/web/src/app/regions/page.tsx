"use client";

// 지역 설정 — 등록 지역 리스트(선택·삭제·빈 상태)와 지역 추가 진입점.
// 최초 진입(동의 이력 없음) 시 동의 바텀시트가 자동으로 열린다(ConsentSheet 내부 판정).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConsentSheet } from "../../components/ConsentSheet";
import { RegionList } from "../../components/RegionList";
import { CtaButton } from "../../components/ui/CtaButton";
import styles from "./page.module.css";

export default function RegionsPage() {
  const router = useRouter();
  const [hasRegions, setHasRegions] = useState(false);

  return (
    <main className={styles.main}>
      <ConsentSheet />
      <header className={styles.header}>
        <h1 className={styles.title}>
          우리 지역을 등록하면{"\n"}수신호를 알려드려요.
        </h1>
        <p className={styles.subtitle}>
          도로명 주소를 검색해서 우리 지역을 등록해 주세요.
        </p>
      </header>

      <RegionList
        onStoreChange={(store) => setHasRegions(store.regions.length > 0)}
      />

      <Link href="/regions/add" className={styles.addLink}>
        <span>지역 추가하기</span>
        <span className={styles.addIcon} aria-hidden="true">
          +
        </span>
      </Link>

      {hasRegions ? (
        <CtaButton onClick={() => router.push("/")}>시작하기</CtaButton>
      ) : null}
    </main>
  );
}
