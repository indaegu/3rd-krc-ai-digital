"use client";

// 지역 설정 — 등록 지역 리스트(선택·삭제·빈 상태)와 지역 추가 진입점.
// 동의 바텀시트(최초 1회)는 단계 4 Task 7에서 붙는다.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RegionList } from "../../components/RegionList";
import { CtaButton } from "../../components/ui/CtaButton";
import styles from "./page.module.css";

export default function RegionsPage() {
  const router = useRouter();
  const [hasRegions, setHasRegions] = useState(false);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>지역 설정</h1>
        <p className={styles.subtitle}>
          우리 지역을 등록하면 물 사정을 알려드려요.
        </p>
      </header>

      <RegionList
        onStoreChange={(store) => setHasRegions(store.regions.length > 0)}
      />

      <Link href="/regions/add" className={styles.addLink}>
        지역 추가하기
      </Link>

      {hasRegions ? (
        <CtaButton onClick={() => router.push("/")}>물시계 시작하기</CtaButton>
      ) : null}
    </main>
  );
}
