"use client";

// 흐름 상세(/trend) — 큰 차트 + 단계 기준 + 예측 방법 + 공식 전망.
// forecast와 status를 함께 페치한다. status는 **대표 저수지 실측 시계열(rateHistory)** 때문에
// 필요하다 — 메인 카드에만 토글이 있고 "자세히"로 들어오면 사라지던 문제를 없앤다.
// status 실패는 차트 토글만 감추고 나머지 화면에는 영향을 주지 않는다.
// 임계값·라벨의 단일 출처는 lib/data/drought-stage.ts다(규칙 5, UI 복제 금지).
// 예측 카피는 참고 표현만 쓰고, 공식 가뭄 예·경보 우선 고지를 병기한다(규칙 3).

import type { ForecastResponse, StatusResponse } from "@mulsigye/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ReservoirRateChart } from "../../components/ReservoirRateChart";
import { StageGuideCard } from "../../components/StageGuideCard";
import { TrendChart } from "../../components/TrendChart";
import { Card } from "../../components/ui/Card";
import { CtaButton } from "../../components/ui/CtaButton";
import { Skeleton } from "../../components/ui/Skeleton";
import { getForecast, getStatus } from "../../lib/client/api-client";
import { koreanYearMonthDay } from "../../lib/client/estimate-label";
import { currentRegion, loadRegionStore } from "../../lib/client/region-store";
import styles from "./page.module.css";

type ForecastState =
  | { kind: "loading" }
  | { kind: "ready"; data: ForecastResponse }
  | { kind: "error"; message: string; retryable: boolean };

/** 실측 토글용 status — 실패는 조용히 감춘다(상세 화면을 막지 않는다). */
type StatusState =
  | { kind: "loading" }
  | { kind: "ready"; data: StatusResponse }
  | { kind: "hidden" };

type ChartMode = "region" | "reservoir";

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
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
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
    setStatus({ kind: "loading" });
    // 실측 토글 재료 — 실패하면 토글만 감춘다(오류 카드를 띄우지 않는다).
    void getStatus(sigunCode).then((result) => {
      if (!mountedRef.current) {
        return;
      }
      setStatus(
        result.kind === "ok"
          ? { kind: "ready", data: result.data }
          : { kind: "hidden" },
      );
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

      {forecast.kind === "ready" ? (
        <TrendDetail
          data={forecast.data}
          status={status.kind === "ready" ? status.data : null}
        />
      ) : null}
    </main>
  );
}

/** `YYYY-MM` → "2026년 1월". 지난 달인지 사용자가 바로 알 수 있게 연도까지 쓴다. */
function koreanYearMonth(targetMonth: string): string {
  const year = Number(targetMonth.slice(0, 4));
  const month = Number(targetMonth.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return targetMonth;
  return `${String(year)}년 ${String(month)}월`;
}

/** 발표 후 2개월이 넘으면 "지난 전망" 고지를 붙인다(월 단위 발행 주기의 두 배). */
const OUTLOOK_STALE_MONTHS = 2;

function isOutlookStale(
  outlook: NonNullable<ForecastResponse["officialOutlook"]>,
): boolean {
  return (outlook.monthsSincePublished ?? 0) > OUTLOOK_STALE_MONTHS;
}

/** 예측값이 사실상 평평한지(naive 등) — linear/ma7/ses는 기울 수 있어 캡션 조건이 된다. */
function isForecastFlat(forecast: ForecastResponse["forecast"]): boolean {
  if (forecast.length === 0) return false;
  const ratios = forecast.map((point) => point.avgRatio);
  return Math.max(...ratios) - Math.min(...ratios) < 0.1;
}

function TrendDetail({
  data,
  status,
}: {
  data: ForecastResponse;
  status: StatusResponse | null;
}) {
  const outlook = data.officialOutlook;
  // 예측선이 실제로 평평할 때만 "평평한 건 …" 설명을 보여준다(기우는 예측엔 부적합).
  const forecastFlat = isForecastFlat(data.forecast);
  const [mode, setMode] = useState<ChartMode>("region");
  // 예상 밖 페이로드(구 서버·중간 프록시)에도 상세 화면이 죽지 않도록 방어한다.
  const rates = status?.reservoir?.rateHistory ?? [];
  // 점이 2개는 있어야 선으로 의미가 있다(메인 카드 TrendChartCard와 같은 조건).
  const canToggle = rates.length >= 2;
  const showReservoir = canToggle && mode === "reservoir";
  return (
    <>
      <div className={styles.pagehead}>
        <h1 className={styles.title}>
          {showReservoir
            ? `${status?.reservoir.name ?? "대표 저수지"} 실제 저수율`
            : `${data.sigunName} 지역 평년 대비 저수율`}
        </h1>
        <p className={styles.sub}>
          {showReservoir
            ? `최근 ${String(rates.length)}일 실측이에요`
            : `지난 ${String(data.history.length)}일 실측과 앞으로 ${String(data.forecast.length)}일 예측이에요`}
        </p>
      </div>

      <Card>
        {/* 메인 카드에만 있던 토글을 상세에도 둔다 — "자세히"로 들어오면 실측 보기가
            사라지던 문제(코드 리뷰 P1)를 없앤다. 두 지표는 축이 달라 겹쳐 그리지 않는다. */}
        {canToggle ? (
          <div
            className={styles.toggle}
            role="group"
            aria-label="차트 지표 선택"
          >
            <button
              type="button"
              className={styles.toggleButton}
              aria-pressed={mode === "region"}
              onClick={() => {
                setMode("region");
              }}
            >
              지역 평년 대비
            </button>
            <button
              type="button"
              className={styles.toggleButton}
              aria-pressed={mode === "reservoir"}
              onClick={() => {
                setMode("reservoir");
              }}
            >
              저수지 실측
            </button>
          </div>
        ) : null}

        {showReservoir ? (
          <ReservoirRateChart
            history={rates}
            name={status?.reservoir.name}
            height={300}
          />
        ) : (
          <TrendChart forecast={data} height={300} showDates />
        )}
        <ul className={styles.legend} aria-label="차트 범례">
          {showReservoir ? (
            <li>
              <i className={styles.legendSolid} aria-hidden="true" />
              실측 저수율
            </li>
          ) : (
            <>
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
            </>
          )}
        </ul>
        {forecastFlat && !showReservoir ? (
          <p className={styles.flatNote} data-testid="trend-flat-note">
            예측선이 평평한 건 지금 수준이 이어질 가능성이 가장 높다는 뜻이에요.
            실제 오르내림은 흐린 띠 범위로 봐요.
          </p>
        ) : null}
      </Card>

      <StageGuideCard stageGuide={data.stageGuide} />

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
            {koreanYearMonthDay(outlook.publishedOn)} 발표분이에요. 자체
            예측보다 공식 전망이 우선이에요.
          </p>
          {/* 원천이 연 1회 갱신이라 발표가 오래된 경우가 있다. 그걸 숨기면
              "지금 정상 / 1개월 뒤 정상"이 오늘 판단처럼 읽힌다. */}
          {isOutlookStale(outlook) ? (
            <p className={styles.outlookStale}>
              발표 후 {outlook.monthsSincePublished}개월이 지나 지금 상황과 다를
              수 있어요. 최신 예·경보는 농어촌공사 발표를 확인해 주세요.
            </p>
          ) : null}
          <ul className={styles.outlookList}>
            <li className={styles.outlookRow}>
              <span className={styles.outlookLabel}>발표 당시</span>
              <span className={styles.outlookValue}>
                {outlook.current.label}
              </span>
            </li>
            {/* 라벨은 "1개월 뒤"가 아니라 **서버가 준 대상 월**이다 — 이미 지난 달일 수 있다. */}
            {(
              [
                [outlook.targetMonths?.[0], outlook.outlook1m],
                [outlook.targetMonths?.[1], outlook.outlook2m],
                [outlook.targetMonths?.[2], outlook.outlook3m],
              ] as const
            ).map(([targetMonth, stage], index) => (
              <li
                key={stage.code + String(index)}
                className={styles.outlookRow}
              >
                <span className={styles.outlookLabel}>
                  {targetMonth === undefined
                    ? `${String(index + 1)}개월 뒤`
                    : koreanYearMonth(targetMonth)}
                </span>
                <span className={styles.outlookValue}>{stage.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
