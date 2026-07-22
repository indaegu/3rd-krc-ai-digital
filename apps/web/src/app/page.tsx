"use client";

// 메인 — 상태(status)·예측(forecast) 모듈 조립. 두 모듈은 병렬 페치하며
// 서로의 실패에 영향받지 않는다(모듈별 오류 카드). 코치 모듈은 Task 6에서
// 이어서 삽입한다. 게이팅은 지역 유무만 본다(consentVersion 검사는 Task 7 몫).

import type { ForecastResponse, StatusResponse } from "@mulsigye/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CoachCard, type CoachCardState } from "../components/CoachCard";
import { HighWaterBanner } from "../components/HighWaterBanner";
import { MainHeader } from "../components/MainHeader";
import { ReachCard } from "../components/ReachCard";
import { SourcesCard } from "../components/SourcesCard";
import { TodayCard } from "../components/TodayCard";
import { TrendChartCard } from "../components/TrendChartCard";
import { Card } from "../components/ui/Card";
import { CtaButton } from "../components/ui/CtaButton";
import { Skeleton } from "../components/ui/Skeleton";
import { getCoach, getForecast, getStatus } from "../lib/client/api-client";
import {
  currentRegion,
  loadRegionStore,
  type StoredRegion,
} from "../lib/client/region-store";
import styles from "./page.module.css";

type StatusState =
  | { kind: "loading" }
  | { kind: "ready"; data: StatusResponse }
  | { kind: "error"; message: string; retryable: boolean };

type ForecastState =
  | { kind: "loading" }
  | { kind: "ready"; data: ForecastResponse }
  | { kind: "error"; message: string; retryable: boolean };

// 코치 모듈 상태는 CoachCard가 소유하는 discriminated union을 그대로 쓴다.
// 코치는 다른 모듈을 막지 않는 비차단 페치이며 실패해도 이 모듈만 오류 카드가 된다.
type CoachState = CoachCardState;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** asOf(UTC ISO) → "오늘 오전/오후 h:mm 기준" (KST 고정, 기기 시간대 무관). */
function formatAsOfStamp(asOf: string): string {
  const kst = new Date(new Date(asOf).getTime() + KST_OFFSET_MS);
  const hours = kst.getUTCHours();
  const meridiem = hours < 12 ? "오전" : "오후";
  const clockHour = ((hours + 11) % 12) + 1;
  const minutes = String(kst.getUTCMinutes()).padStart(2, "0");
  return `오늘 ${meridiem} ${clockHour}:${minutes} 기준`;
}

function stampText(state: StatusState): string | null {
  if (state.kind === "loading") {
    return "불러오는 중…";
  }
  if (state.kind === "error") {
    return null;
  }
  if (state.data.stale) {
    // 지연 폴백: 화면 구조는 그대로 두고 관측 기준일 + 지연 문구만 바꾼다.
    const observedOn =
      state.data.reservoir.observedOn ?? state.data.region.observedOn;
    return `${observedOn} 기준 · 지연된 정보예요`;
  }
  return formatAsOfStamp(state.data.asOf);
}

/** 예측 모듈(이 추세라면·저수율 흐름) 스켈레톤. */
function ForecastSkeleton() {
  return (
    <>
      <Card aria-hidden="true">
        <Skeleton width="96px" height="14px" />
        <div className={styles.skeletonStack}>
          <Skeleton width="140px" height="40px" />
          <Skeleton width="220px" height="14px" />
        </div>
      </Card>
      <Card aria-hidden="true">
        <Skeleton width="200px" height="14px" />
        <div className={styles.skeletonStack}>
          <Skeleton width="100%" height="180px" />
        </div>
      </Card>
    </>
  );
}

/** 오늘 우리 저수지 모듈 스켈레톤(shimmer 1.3s — 풀스크린 스피너 금지). */
function TodayCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <Skeleton width="96px" height="14px" />
      <div className={styles.skeletonRow}>
        <div className={styles.skeletonInfo}>
          <Skeleton width="120px" height="44px" />
          <Skeleton width="90px" height="14px" />
          <Skeleton width="64px" height="24px" />
          <Skeleton width="150px" height="14px" />
        </div>
        <span className={styles.skeletonGauge} aria-hidden="true">
          <Skeleton width="74px" height="196px" />
        </span>
      </div>
    </Card>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [region, setRegion] = useState<StoredRegion | null>(null);
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [forecast, setForecast] = useState<ForecastState>({ kind: "loading" });
  const [coach, setCoach] = useState<CoachState>({ kind: "loading" });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 게이팅: 등록 지역이 없으면 /onboarding으로 보낸다(replace).
  useEffect(() => {
    const current = currentRegion(loadRegionStore());
    if (current === null) {
      router.replace("/onboarding");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라이언트 마운트 후에만 읽을 수 있다
    setRegion(current);
  }, [router]);

  // status·forecast 병렬 페치 — 한쪽이 실패해도 다른 모듈은 유지한다.
  const load = useCallback((sigunCode: string) => {
    setStatus({ kind: "loading" });
    setForecast({ kind: "loading" });
    setCoach({ kind: "loading" });
    void getStatus(sigunCode).then((result) => {
      if (!mountedRef.current) {
        return;
      }
      if (result.kind === "ok") {
        setStatus({ kind: "ready", data: result.data });
      } else {
        setStatus({
          kind: "error",
          message: result.message,
          retryable: result.retryable,
        });
      }
    });
    void getForecast(sigunCode).then((result) => {
      if (!mountedRef.current) {
        return;
      }
      if (result.kind === "ok") {
        setForecast({ kind: "ready", data: result.data });
      } else {
        setForecast({
          kind: "error",
          message: result.message,
          retryable: result.retryable,
        });
      }
    });
    // 코치는 비차단 페치 — 실패해도 이 모듈만 오류 카드가 되고 나머지는 유지된다.
    void getCoach(sigunCode).then((result) => {
      if (!mountedRef.current) {
        return;
      }
      if (result.kind === "ok") {
        setCoach({ kind: "ready", data: result.data });
      } else {
        setCoach({
          kind: "error",
          message: result.message,
          retryable: result.retryable,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (region !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount 결과를 상태로 반영한다
      load(region.sigunCode);
    }
  }, [region, load]);

  const refresh = useCallback(() => {
    if (region !== null && status.kind !== "loading") {
      load(region.sigunCode);
    }
  }, [region, status.kind, load]);

  if (region === null) {
    // 게이팅 판정 전(또는 /onboarding 이동 중)에는 아무것도 그리지 않는다.
    return null;
  }

  const stamp = stampText(status);
  const regionLabel =
    status.kind === "ready"
      ? `${status.data.sigunName} · ${status.data.reservoir.name}`
      : null;

  return (
    <main className={styles.main}>
      <h1 className={styles.srOnly}>물시계</h1>
      <MainHeader
        regionLabel={regionLabel}
        refreshing={status.kind === "loading"}
        onRefresh={refresh}
      />
      {stamp === null ? null : <p className={styles.stamp}>{stamp}</p>}

      <div className={styles.feed}>
        {status.kind === "loading" ? <TodayCardSkeleton /> : null}

        {status.kind === "ready" ? (
          <>
            <HighWaterBanner notice={status.data.highWaterNotice} />
            <TodayCard status={status.data} />
          </>
        ) : null}

        {status.kind === "error" ? (
          <Card className={styles.errorCard} aria-live="polite">
            <h2 className={styles.errorTitle}>
              지금은 물 사정을 불러오지 못했어요
            </h2>
            <p className={styles.errorMessage}>{status.message}</p>
            {status.retryable ? (
              <CtaButton onClick={refresh}>다시 시도하기</CtaButton>
            ) : null}
          </Card>
        ) : null}

        {forecast.kind === "loading" ? <ForecastSkeleton /> : null}

        {forecast.kind === "ready" ? (
          <>
            <ReachCard forecast={forecast.data} />
            <TrendChartCard forecast={forecast.data} />
          </>
        ) : null}

        {forecast.kind === "error" ? (
          <Card className={styles.errorCard} aria-live="polite">
            <h2 className={styles.errorTitle}>흐름 예측을 불러오지 못했어요</h2>
            <p className={styles.errorMessage}>{forecast.message}</p>
            {forecast.retryable ? (
              <CtaButton onClick={refresh}>다시 시도하기</CtaButton>
            ) : null}
          </Card>
        ) : null}

        {/* ④ 물시계 코치 — 비차단. 스켈레톤·오류 카드는 모듈이 스스로 소유한다. */}
        <CoachCard state={coach} onRetry={refresh} />

        {/* ⑤ 근거·한계 고지 — 코치 응답의 sources·stale을 그대로 반영한다. */}
        {coach.kind === "ready" ? (
          <SourcesCard sources={coach.data.sources} stale={coach.data.stale} />
        ) : null}

        {/* 모든 예측 화면 공통 고지(규칙 3, product.md 카피 규칙). */}
        <p className={styles.disclaimer}>
          예측은 참고용이며 공식 가뭄 예·경보가 우선이에요.
        </p>
      </div>
    </main>
  );
}
