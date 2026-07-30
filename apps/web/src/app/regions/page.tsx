"use client";

// 지역 설정 — 등록 지역 리스트(선택·삭제·빈 상태)와 지역 추가 진입점.
// 최초 진입(동의 이력 없음) 시 동의 바텀시트가 자동으로 열린다(ConsentSheet 내부 판정).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConsentSheet } from "../../components/ConsentSheet";
import { RegionList, type RegionListStatus } from "../../components/RegionList";
import { CtaButton } from "../../components/ui/CtaButton";
import styles from "./page.module.css";

const INITIAL_STATUS: RegionListStatus = {
  hasRegions: false,
  currentLoading: false,
};

export default function RegionsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<RegionListStatus>(INITIAL_STATUS);

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

      <RegionList onStatusChange={setStatus} />

      <Link href="/regions/add" className={styles.addLink}>
        <span>지역 추가하기</span>
        <span className={styles.addIcon} aria-hidden="true">
          +
        </span>
      </Link>

      {status.hasRegions ? (
        <>
          {/* 이름을 아직 못 받은 지역으로 들어가면 메인이 빈 채로 열린다. 여기서 기다린다. */}
          <CtaButton
            onClick={() => router.push("/")}
            disabled={status.currentLoading}
          >
            {status.currentLoading ? "지역을 불러오는 중이에요…" : "시작하기"}
          </CtaButton>
        </>
      ) : null}
    </main>
  );
}
