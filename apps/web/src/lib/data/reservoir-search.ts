// 저수지 이름 검색(순수 함수) — 주소를 몰라도 아는 저수지 이름으로 지역을 등록하게 한다.
//
// 넓은 시군에서는 주소만으로 원하는 저수지가 안 잡힐 수 있다(제주시 5곳 등). 그때 쓰는 길이다.
// 후보는 커밋 스냅샷(시설제원 정규화본)에서만 오고, 이름·소재지·시군명을 그대로 보여준다.
// 좌표·거리는 쓰지 않는다.

import type { ReservoirSpec } from "./normalize-reservoir-spec.ts";
import reservoirsJson from "../../../../../data/snapshots/reservoirs.json" with { type: "json" };
import sigunIndexJson from "../../../../../data/snapshots/sigun-index.json" with { type: "json" };

export type SigunIndex = Record<
  string,
  { sidoName: string; sigunName: string }
>;

const SNAPSHOT: readonly ReservoirSpec[] = reservoirsJson;
const SIGUN_INDEX: SigunIndex = sigunIndexJson;

/** 한 번에 돌려주는 최대 후보 수. 목록이 길어지면 고령 사용자가 고르기 어렵다. */
export const RESERVOIR_SEARCH_LIMIT = 20;

export type ReservoirSearchHit = {
  facCode: string;
  name: string;
  /** 시설제원 소재지. 같은 이름이 여러 곳에 있어 구분에 필요하다. */
  address: string | null;
  sigunCode: string;
  /** 논가뭄지도 기준 시군명. 준비되지 않은 시군이면 null. */
  sigunName: string | null;
  /** 논가뭄지도에 있는 시군이라 지역 등록이 가능한지. */
  prepared: boolean;
};

export type ReservoirSearchDeps = {
  snapshot?: readonly ReservoirSpec[];
  sigunIndex?: SigunIndex;
  limit?: number;
};

/**
 * 이름(또는 소재지)에 검색어가 든 저수지를 찾는다.
 *
 * 정렬은 결정적이다 — ① 이름이 검색어로 시작 ② 이름에 포함 ③ 소재지에만 포함 순,
 * 같은 등급 안에서는 수혜면적 큰 순 → facCode 오름차순.
 * `prepared=false`(논가뭄지도에 없는 시군)도 숨기지 않고 함께 준다 — 화면에서 "준비 중"을
 * 알려주는 편이 검색 결과가 통째로 비는 것보다 낫다.
 */
export function searchReservoirsByName(
  query: string,
  deps: ReservoirSearchDeps = {},
): ReservoirSearchHit[] {
  const needle = query.trim();
  if (needle === "") return [];

  const snapshot = deps.snapshot ?? SNAPSHOT;
  const sigunIndex = deps.sigunIndex ?? SIGUN_INDEX;
  const limit = deps.limit ?? RESERVOIR_SEARCH_LIMIT;

  const scored: { rank: number; spec: ReservoirSpec }[] = [];
  for (const spec of snapshot) {
    const name = spec.name;
    const address = spec.address ?? "";
    const rank = name.startsWith(needle)
      ? 0
      : name.includes(needle)
        ? 1
        : address.includes(needle)
          ? 2
          : -1;
    if (rank < 0) continue;
    scored.push({ rank, spec });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const areaA = a.spec.beneficiaryArea;
    const areaB = b.spec.beneficiaryArea;
    if (areaA !== areaB) {
      if (areaA === null) return 1;
      if (areaB === null) return -1;
      return areaB - areaA;
    }
    return a.spec.facCode < b.spec.facCode ? -1 : 1;
  });

  return scored.slice(0, limit).map(({ spec }) => {
    const sigun = Object.hasOwn(sigunIndex, spec.sigunCode)
      ? sigunIndex[spec.sigunCode]
      : undefined;
    return {
      facCode: spec.facCode,
      name: spec.name,
      address: spec.address,
      sigunCode: spec.sigunCode,
      sigunName: sigun?.sigunName ?? null,
      prepared: sigun !== undefined,
    };
  });
}

/** facCode가 스냅샷에 있고 그 시군이 준비된 지역인지 확인한다(등록 요청 검증용). */
export function findReservoirByFacCode(
  facCode: string,
  deps: ReservoirSearchDeps = {},
): ReservoirSearchHit | null {
  const snapshot = deps.snapshot ?? SNAPSHOT;
  const sigunIndex = deps.sigunIndex ?? SIGUN_INDEX;
  const spec = snapshot.find((item) => item.facCode === facCode);
  if (spec === undefined) return null;
  const sigun = Object.hasOwn(sigunIndex, spec.sigunCode)
    ? sigunIndex[spec.sigunCode]
    : undefined;
  return {
    facCode: spec.facCode,
    name: spec.name,
    address: spec.address,
    sigunCode: spec.sigunCode,
    sigunName: sigun?.sigunName ?? null,
    prepared: sigun !== undefined,
  };
}
