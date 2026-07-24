// GET /api/v1/regions/nearby 조립 — 서버 전용.
// 좌표가 없어 '주변'은 같은 시·도(sidoName)로 정의한다. 커밋 스냅샷
// regional-drought-daily.json에서 지역별 최신 행을 골라 같은 시·도만 추려
// 가뭄 심한 순(avgRatio 오름차순)으로 정렬한다. 사실만 반환한다 —
// officialStage는 스냅샷 값을 그대로 매핑하고 임계값으로 재계산하지 않는다
// (AGENTS.md 규칙 5). 스냅샷 기반이라 stale=true다(status-service의
// 커밋 스냅샷 폴백 관례와 동일).
import type { NearbyResponse } from "@mulsigye/contracts";
import {
  stageCodeFromAvgRatio,
  stageCodeFromLabel,
  type DroughtStageCode,
} from "./drought-stage.ts";
import { committedSnapshotSource } from "./status-service.ts";
import regionalSnapshotJson from "../../../../../data/snapshots/regional-drought-daily.json" with { type: "json" };

/** 스냅샷 한 행 — status-service의 RegionalSnapshotRow에 시·도/시군 이름을 더한 형태. */
export type NearbySnapshotRow = {
  observedOn: string;
  sidoName: string;
  sigunName: string;
  sigunCode: string;
  avgRatio: number;
  officialStage: string;
};

const REGIONAL_SNAPSHOT: readonly NearbySnapshotRow[] = regionalSnapshotJson;

export type NearbyServiceDeps = {
  /** 테스트 주입용 스냅샷 — 미주입 시 커밋 스냅샷을 쓴다(status-service DI 방식과 동일). */
  snapshot?: readonly NearbySnapshotRow[];
};

export type NearbyResult =
  | { kind: "ok"; body: NearbyResponse }
  | { kind: "not_prepared" }
  | { kind: "unavailable" };

/** 원천 라벨이 유효하면 원천 우선, 없으면 공인 임계값으로 계산한다(status-service와 동일한 규칙). */
function mapStage(officialStage: string, avgRatio: number): DroughtStageCode {
  return stageCodeFromLabel(officialStage) ?? stageCodeFromAvgRatio(avgRatio);
}

/** 지역별 최신 행(max observedOn)만 남긴다. */
function latestBySigunCode(
  snapshot: readonly NearbySnapshotRow[],
): Map<string, NearbySnapshotRow> {
  const latest = new Map<string, NearbySnapshotRow>();
  for (const row of snapshot) {
    const seen = latest.get(row.sigunCode);
    if (seen === undefined || row.observedOn > seen.observedOn) {
      latest.set(row.sigunCode, row);
    }
  }
  return latest;
}

/**
 * sigunCode 하나로 같은 시·도 지역 비교를 조립한다. HTTP 매핑은 라우트가 맡는다.
 * 요청 지역이 스냅샷에 없으면 not_prepared, 스냅샷이 비어 조립 불가면 unavailable.
 */
export function buildNearby(
  sigunCode: string,
  deps: NearbyServiceDeps = {},
): NearbyResult {
  const snapshot = deps.snapshot ?? REGIONAL_SNAPSHOT;
  if (snapshot.length === 0) {
    return { kind: "unavailable" };
  }

  const latest = latestBySigunCode(snapshot);
  const requested = latest.get(sigunCode);
  if (requested === undefined) {
    return { kind: "not_prepared" };
  }

  const sidoName = requested.sidoName;
  const rows = [...latest.values()].filter((row) => row.sidoName === sidoName);
  if (rows.length === 0) {
    return { kind: "unavailable" };
  }

  // 가뭄 심한 순(avgRatio 오름차순), 동률은 시군 이름 사전순.
  rows.sort((a, b) =>
    a.avgRatio !== b.avgRatio
      ? a.avgRatio - b.avgRatio
      : a.sigunName < b.sigunName
        ? -1
        : a.sigunName > b.sigunName
          ? 1
          : 0,
  );

  // 시·도 안 최신 observedOn. 빈 문자열에서 시작해도 어떤 날짜든 크므로 안전하다.
  const asOf = rows.reduce(
    (max, row) => (row.observedOn > max ? row.observedOn : max),
    "",
  );

  const body: NearbyResponse = {
    schemaVersion: "1",
    sidoName,
    asOf,
    regions: rows.map((row) => ({
      sigunCode: row.sigunCode,
      sigunName: row.sigunName,
      avgRatio: row.avgRatio,
      stageCode: mapStage(row.officialStage, row.avgRatio),
      current: row.sigunCode === sigunCode,
    })),
    // 커밋 스냅샷 기반이라 항상 stale=true다.
    stale: true,
    sources: [committedSnapshotSource(asOf)],
  };
  return { kind: "ok", body };
}
