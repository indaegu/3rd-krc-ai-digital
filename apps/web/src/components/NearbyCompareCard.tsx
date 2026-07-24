// 주변 지역 비교 모듈 — 같은 시·도 안에서 우리 지역의 물 사정을 이웃과 비교한다.
// 좌표가 없어 '주변'은 같은 시·도로 정의한다(서버 nearby-service와 동일한 규칙).
// 목록은 가뭄 심한 순(서버가 확정한 avgRatio 오름차순) 그대로 그리고, 우리 지역을
// 강조한다. 단계 색·라벨은 drought-stage / design-system 토큰 단일 출처만 쓴다.
import type { NearbyResponse } from "@mulsigye/contracts";

import { STAGE_LABEL_BY_CODE } from "../lib/data/drought-stage";
import { Card } from "./ui/Card";
import styles from "./NearbyCompareCard.module.css";

/** 평년 대비 저수율 표시 — 소수 1자리 반올림, 정수면 소수점 없이. */
function formatRatio(avgRatio: number): string {
  const rounded = Math.round(avgRatio * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function NearbyCompareCard({ data }: { data: NearbyResponse }) {
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

  return (
    <Card>
      <h2 className={styles.title}>{sidoName} 안에서 비교</h2>
      {rank !== null ? (
        <p className={styles.summary}>
          {sidoName} {regions.length}곳 중 물 사정이{" "}
          <b className={styles.rank}>{rank}번째</b>로 넉넉해요.
        </p>
      ) : null}
      <ul className={styles.list}>
        {regions.map((region) => (
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
    </Card>
  );
}
