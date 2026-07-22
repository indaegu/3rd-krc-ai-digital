"use client";

// 흐름 상세(/trend) — 큰 차트 + 단계 기준 + 예측 방법 + 공식 전망.
// forecast만 페치한다(제목 시군명·MAE·공식 전망 모두 forecast 응답에서 나온다).
// 임계값·라벨의 단일 출처는 lib/data/drought-stage.ts다(규칙 5, UI 복제 금지).
// 예측 카피는 참고 표현만 쓰고, 공식 가뭄 예·경보 우선 고지를 병기한다(규칙 3).

import type { ForecastResponse } from "@mulsigye/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { TrendChart } from "../../components/TrendChart";
import { Card } from "../../components/ui/Card";
import { CtaButton } from "../../components/ui/CtaButton";
import { Skeleton } from "../../components/ui/Skeleton";
import { getForecast } from "../../lib/client/api-client";
import { currentRegion, loadRegionStore } from "../../lib/client/region-store";
import {
  DROUGHT_STAGE_THRESHOLDS,
  STAGE_LABEL_BY_CODE,
  type DroughtStageCode,
} from "../../lib/data/drought-stage";
import styles from "./page.module.css";

type ForecastState =
  | { kind: "loading" }
  | { kind: "ready"; data: ForecastResponse }
  | { kind: "error"; message: string; retryable: boolean };

/**
 * 가뭄 단계 기준 표 — 5단계 + 기준 + 한 줄 행동.
 * 기준 문구는 임계값을 하드코딩하지 않고 drought-stage 단일 출처에서 조립한다.
 */
const STAGE_GUIDE: ReadonlyArray<{
  code: DroughtStageCode;
  range: string;
  action: string;
}> = [
  {
    code: "ok",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.ok}% 초과`,
    action: "평소처럼 관리하면 돼요",
  },
  {
    code: "watch",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.ok}% 이하`,
    action: "물 사용을 조금씩 아껴요",
  },
  {
    code: "care",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.watch}% 이하`,
    action: "공동 급수 일정을 확인해요",
  },
  {
    code: "alert",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.care}% 이하`,
    action: "제한급수·대체수원을 준비해요",
  },
  {
    code: "crit",
    range: `평년 대비 ${DROUGHT_STAGE_THRESHOLDS.alert}% 이하`,
    action: "관계기관 안내에 따라요",
  },
];

/** MAE %p 표시 — model 메타 실값을 소수 1자리로(하드코딩 금지). */
function formatMae(value: number): string {
  return value.toFixed(1);
}

function ChartCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <Skeleton width="180px" height="20px" />
      <div className={styles.skeletonStack}>
        <Skeleton width="100%" height="240px" />
      </div>
    </Card>
  );
}

export default function TrendPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [forecast, setForecast] = useState<ForecastState>({ kind: "loading" });
  const mountedRef = useRef(true);
  const sigunRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback((sigunCode: string) => {
    setForecast({ kind: "loading" });
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
  }, []);

  // 지역이 없으면 메인으로 돌려보낸다(메인 게이팅이 온보딩·지역 등록을 담당).
  useEffect(() => {
    const region = currentRegion(loadRegionStore());
    if (region === null) {
      router.replace("/");
      return;
    }
    sigunRef.current = region.sigunCode;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라이언트 마운트 후에만 읽는다
    setReady(true);
    load(region.sigunCode);
  }, [router, load]);

  const retry = useCallback(() => {
    if (sigunRef.current !== null) {
      load(sigunRef.current);
    }
  }, [load]);

  if (!ready) {
    return null;
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="뒤로">
          <span aria-hidden="true">←</span>
        </Link>
        <span className={styles.headerTitle}>지역 평년 대비 흐름</span>
      </header>

      {forecast.kind === "loading" ? (
        <>
          <div className={styles.pagehead}>
            <Skeleton width="240px" height="28px" />
          </div>
          <ChartCardSkeleton />
        </>
      ) : null}

      {forecast.kind === "error" ? (
        <Card className={styles.errorCard} aria-live="polite">
          <h1 className={styles.title}>흐름을 불러오지 못했어요</h1>
          <p className={styles.errorMessage}>{forecast.message}</p>
          {forecast.retryable ? (
            <CtaButton onClick={retry}>다시 시도하기</CtaButton>
          ) : null}
        </Card>
      ) : null}

      {forecast.kind === "ready" ? <TrendDetail data={forecast.data} /> : null}
    </main>
  );
}

function TrendDetail({ data }: { data: ForecastResponse }) {
  const outlook = data.officialOutlook;
  return (
    <>
      <div className={styles.pagehead}>
        <h1 className={styles.title}>{data.sigunName} 지역 평년 대비 저수율</h1>
        <p className={styles.sub}>
          지난 {data.history.length}일 실측과 앞으로 {data.forecast.length}일
          예측이에요
        </p>
      </div>

      <Card>
        <TrendChart forecast={data} height={300} />
        <ul className={styles.legend} aria-label="차트 범례">
          <li>
            <i className={styles.legendSolid} aria-hidden="true" />
            실측
          </li>
          <li>
            <i className={styles.legendDash} aria-hidden="true" />
            예측
          </li>
          <li>
            <i className={styles.legendBand} aria-hidden="true" />
            불확실 구간
          </li>
        </ul>
      </Card>

      <Card>
        <h2 className={styles.sectionTitle}>가뭄 단계 기준</h2>
        <ul className={styles.stageGuide}>
          {STAGE_GUIDE.map((stage) => (
            <li key={stage.code} className={styles.stageRow}>
              <span className={`${styles.stageChip} ${styles[stage.code]}`}>
                {STAGE_LABEL_BY_CODE[stage.code]}
              </span>
              <span className={styles.stageBody}>
                <b className={styles.stageRange}>{stage.range}</b>
                <small className={styles.stageAction}>{stage.action}</small>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className={styles.sectionTitle}>예측은 이렇게 계산해요</h2>
        <p className={styles.method}>
          최근 {data.history.length}일 지역 평년 대비 저수율의 <b>변화 추세</b>
          로 앞으로 {data.forecast.length}일을 내다봐요. 여러 방법(전일
          유지·평균·선형 추세·지수평활)을 과거 데이터로 시험해{" "}
          <b>오차가 가장 낮은 모델</b>을 골라 써요.
        </p>
        <p className={styles.method}>
          현재 예측 오차는{" "}
          <b>
            7일 ±{formatMae(data.model.mae7)}%p · 14일 ±
            {formatMae(data.model.mae14)}%p 수준
          </b>
          이에요. 예측은 참고용이며, <b>공식 가뭄 예·경보가 항상 우선</b>이에요.
        </p>
      </Card>

      {outlook ? (
        <Card>
          <h2 className={styles.sectionTitle}>공식 가뭄 전망</h2>
          <p className={styles.method}>
            {outlook.publishedOn} 발표 기준이에요. 자체 예측보다 공식 전망이
            우선이에요.
          </p>
          <ul className={styles.outlookList}>
            <li className={styles.outlookRow}>
              <span className={styles.outlookLabel}>지금</span>
              <span className={styles.outlookValue}>
                {outlook.current.label}
              </span>
            </li>
            <li className={styles.outlookRow}>
              <span className={styles.outlookLabel}>1개월 뒤</span>
              <span className={styles.outlookValue}>
                {outlook.outlook1m.label}
              </span>
            </li>
            <li className={styles.outlookRow}>
              <span className={styles.outlookLabel}>2개월 뒤</span>
              <span className={styles.outlookValue}>
                {outlook.outlook2m.label}
              </span>
            </li>
            <li className={styles.outlookRow}>
              <span className={styles.outlookLabel}>3개월 뒤</span>
              <span className={styles.outlookValue}>
                {outlook.outlook3m.label}
              </span>
            </li>
          </ul>
        </Card>
      ) : null}
    </>
  );
}
