// 주변 지역 비교 모듈 — 같은 시·도 안에서 우리 지역의 물 사정을 이웃과 비교한다.
// 좌표가 없어 '주변'은 같은 시·도로 정의한다(서버 nearby-service와 동일한 규칙).
// 목록은 가뭄 심한 순(서버가 확정한 avgRatio 오름차순) 그대로 그리고, 우리 지역을
// 강조한다. 단계 색·라벨은 drought-stage / design-system 토큰 단일 출처만 쓴다.
//
// **비교는 모든 지역이 같은 날짜일 때만 뜻이 있다.** 그래서 이 카드만은 오늘 추정으로 바꾸지
// 않고 공표 기준일(서버 asOf)을 그대로 쓰며, 그 날짜를 부제에 밝힌다. 오늘 값(TodayCard)과
// 숫자가 다를 수 있는 이유가 화면에 드러나야 한다(코드 리뷰 P1).
"use client";

import type { NearbyResponse } from "@mulsigye/contracts";
import { useState } from "react";

import { STAGE_LABEL_BY_CODE } from "../lib/data/drought-stage";
import { Card } from "./ui/Card";
import styles from "./NearbyCompareCard.module.css";

/** 접힘 상태에서 보여줄 이웃 지역 수. 도 안에 지역이 많아도 카드가 길어지지 않게 한다. */
const COLLAPSED_ROWS = 5;

/**
 * 접힘 상태에서 보여줄 구간 — 우리 지역이 항상 보이도록 우리 지역 중심으로 창을 잡는다.
 * 목록이 창보다 짧으면 전체를 보여준다(우리 지역을 못 찾으면 앞에서부터).
 */
export function nearbyWindow(
  size: number,
  currentIndex: number,
  visible: number,
): [number, number] {
  if (size <= visible) return [0, size];
  const anchor = currentIndex < 0 ? 0 : currentIndex;
  const start = Math.min(
    Math.max(anchor - Math.floor(visible / 2), 0),
    size - visible,
  );
  return [start, start + visible];
}

/** 평년 대비 저수율 표시 — 소수 1자리 반올림, 정수면 소수점 없이. */
function formatRatio(avgRatio: number): string {
  const rounded = Math.round(avgRatio * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function NearbyCompareCard({ data }: { data: NearbyResponse }) {
  // 훅은 early return보다 위에서 호출한다(react-hooks/rules-of-hooks).
  const [expanded, setExpanded] = useState(false);
  const { sidoName, regions } = data;
  if (regions.length === 0) {
    return null;
  }

  const current = regions.find((region) => region.current);
  // 순위는 '넉넉한 순'으로 매긴다 — 나보다 avgRatio가 높은 지역 수 + 1.
  const rank =
    current === undefined
      ? null
      : regions.filter((region) => region.avgRatio > current.avgRatio).length +
        1;

  // 도 안 지역이 많으면(예: 경북 20곳 이상) 우리 지역 주변 몇 곳만 먼저 보여준다.
  // 카드 안에 또 스크롤을 만들지 않고 "더 보기"로 펼쳐 페이지 스크롤이 길어지지 않게 한다.
  const currentIndex = regions.findIndex((region) => region.current);
  const [from, to] = expanded
    ? [0, regions.length]
    : nearbyWindow(regions.length, currentIndex, COLLAPSED_ROWS);
  const visible = regions.slice(from, to);
  const hidden = regions.length - visible.length;

  return (
    <Card>
      <h2 className={styles.title}>{sidoName} 안에서 비교</h2>
      {/* 모든 지역을 같은 날짜로 견줘야 순위가 뜻이 있다 — 그 기준일을 그대로 밝힌다. */}
      <p className={styles.basisNote}>
        {data.asOf} 공표 자료로 모든 지역을 같은 날 기준으로 비교했어요.
      </p>
      {rank !== null ? (
        <p className={styles.summary}>
          {sidoName} {regions.length}곳 중 물 사정이{" "}
          <b className={styles.rank}>{rank}번째</b>로 넉넉해요.
        </p>
      ) : null}
      <ul className={styles.list}>
        {visible.map((region) => (
          <li
            key={region.sigunCode}
            className={`${styles.row} ${region.current ? styles.current : ""}`}
          >
            <span
              className={`${styles.chip} ${styles[region.stageCode]}`}
              aria-label={`가뭄 단계 ${STAGE_LABEL_BY_CODE[region.stageCode]}`}
            >
              {STAGE_LABEL_BY_CODE[region.stageCode]}
            </span>
            <span className={styles.name}>{region.sigunName}</span>
            {region.current ? (
              <span className={styles.currentMark}>우리 지역</span>
            ) : null}
            <span className={styles.ratio}>
              평년 대비 {formatRatio(region.avgRatio)}%
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          className={styles.moreButton}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "접기" : `${hidden}곳 더 보기`}
        </button>
      ) : null}
    </Card>
  );
}
