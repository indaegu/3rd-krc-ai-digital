// 저수지 이름 검색 — 결정적 정렬과 준비 여부 표시를 강제한다.
// 실제 커밋 스냅샷으로도 한 번 확인해, 필드 이름이 바뀌면 여기서 잡힌다.

import { describe, expect, it } from "vitest";

import type { ReservoirSpec } from "./normalize-reservoir-spec.ts";
import {
  findReservoirByFacCode,
  searchReservoirsByName,
  type SigunIndex,
} from "./reservoir-search.ts";

function spec(
  facCode: string,
  name: string,
  address: string,
  beneficiaryArea: number | null,
): ReservoirSpec {
  return {
    facCode,
    name,
    address,
    sigunCode: facCode.slice(0, 5),
    beneficiaryArea,
    effectiveStorage: null,
  };
}

const SNAPSHOT: ReservoirSpec[] = [
  spec("5011010007", "함덕", "제주특별자치도 제주시 조천읍 함덕리", 0),
  spec("4423010045", "탑정", "충청남도 논산시 가야곡면 종연리", 5713),
  spec("4423010046", "아곡", "충청남도 논산시 부적면 신교리", 44.6),
  // 이름에는 없고 소재지에만 "함덕"이 든 후보(등급 3).
  spec("5011010099", "북촌", "제주특별자치도 제주시 조천읍 함덕리 인근", 10),
  // 논가뭄지도에 없는 시군(구 제주도 코드) — prepared=false로 표시만 한다.
  spec("4971010001", "광령", "제주특별자치도 제주시 애월읍 광령리", 30),
];

const SIGUN_INDEX: SigunIndex = {
  "50110": { sidoName: "제주", sigunName: "제주시" },
  "44230": { sidoName: "충남", sigunName: "논산시" },
};

const deps = { snapshot: SNAPSHOT, sigunIndex: SIGUN_INDEX };

describe("searchReservoirsByName", () => {
  it("이름으로 찾고 시군명·소재지를 함께 준다", () => {
    const hits = searchReservoirsByName("함덕", deps);
    expect(hits[0]).toEqual({
      facCode: "5011010007",
      name: "함덕",
      address: "제주특별자치도 제주시 조천읍 함덕리",
      sigunCode: "50110",
      sigunName: "제주시",
      prepared: true,
    });
  });

  it("이름 시작 → 이름 포함 → 소재지 포함 순으로 정렬한다", () => {
    const names = searchReservoirsByName("함덕", deps).map((hit) => hit.name);
    expect(names).toEqual(["함덕", "북촌"]);
  });

  it("같은 등급에서는 수혜면적 큰 순이다", () => {
    const names = searchReservoirsByName("논산시", deps).map((hit) => hit.name);
    expect(names).toEqual(["탑정", "아곡"]);
  });

  it("준비되지 않은 시군도 감추지 않고 prepared=false로 준다", () => {
    const hit = searchReservoirsByName("광령", deps)[0];
    expect(hit?.prepared).toBe(false);
    expect(hit?.sigunName).toBeNull();
  });

  it("빈 검색어는 빈 배열이다", () => {
    expect(searchReservoirsByName("   ", deps)).toEqual([]);
  });

  it("limit을 넘지 않는다", () => {
    expect(searchReservoirsByName("제주", { ...deps, limit: 1 })).toHaveLength(
      1,
    );
  });

  it("커밋 스냅샷에서도 실제 저수지를 찾는다(필드 이름 드리프트 가드)", () => {
    const hits = searchReservoirsByName("탑정");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.facCode).toMatch(/^[0-9]{10}$/);
    expect(hits[0]?.sigunName).toBe("논산시");
  });
});

describe("findReservoirByFacCode", () => {
  it("스냅샷에 있으면 시군 준비 여부까지 돌려준다", () => {
    expect(findReservoirByFacCode("4423010045", deps)?.sigunName).toBe(
      "논산시",
    );
  });

  it("없으면 null", () => {
    expect(findReservoirByFacCode("0000000000", deps)).toBeNull();
  });
});
