import { beforeEach, describe, expect, it } from "vitest";

import {
  moveRegion,
  addRegion,
  createEmptyRegionStore,
  loadRegionStore,
  migrateRegionStore,
  REGION_STORE_KEY,
  removeRegion,
  selectRegion,
  setConsent,
  type StoredRegion,
} from "./region-store";

const NONSAN: StoredRegion = { sigunCode: "44230", facCode: "4423010045" };
const JEJU: StoredRegion = { sigunCode: "50110", facCode: "5011010001" };

beforeEach(() => {
  window.localStorage.clear();
});

describe("region-store 저장·선택·삭제", () => {
  it("빈 localStorage에서는 안전한 초기 상태를 돌려준다", () => {
    expect(loadRegionStore()).toEqual({
      schemaVersion: 1,
      consentVersion: null,
      regions: [],
      currentIndex: 0,
    });
  });

  it("지역을 추가하면 mulsigye:v1 키에 저장되고 현재 지역이 된다", () => {
    addRegion(NONSAN);
    const store = addRegion(JEJU);

    expect(store.regions).toEqual([NONSAN, JEJU]);
    expect(store.currentIndex).toBe(1);
    expect(window.localStorage.getItem(REGION_STORE_KEY)).not.toBeNull();
    expect(loadRegionStore()).toEqual(store);
  });

  it("같은 시군을 다시 추가하면 중복 없이 그 지역을 선택한다", () => {
    addRegion(NONSAN);
    addRegion(JEJU);
    const store = addRegion(NONSAN);

    expect(store.regions).toHaveLength(2);
    expect(store.currentIndex).toBe(0);
  });

  it("selectRegion은 currentIndex를 저장하고 범위 밖 값은 보정한다", () => {
    addRegion(NONSAN);
    addRegion(JEJU);

    expect(selectRegion(0).currentIndex).toBe(0);
    expect(loadRegionStore().currentIndex).toBe(0);
    expect(selectRegion(99).currentIndex).toBe(1);
    expect(selectRegion(-3).currentIndex).toBe(0);
  });

  it("현재 지역을 삭제하면 currentIndex를 남은 범위로 보정한다", () => {
    addRegion(NONSAN);
    addRegion(JEJU);
    selectRegion(1);

    const store = removeRegion(JEJU.sigunCode);

    expect(store.regions).toEqual([NONSAN]);
    expect(store.currentIndex).toBe(0);
    expect(loadRegionStore()).toEqual(store);
  });

  it("앞쪽 지역을 삭제하면 현재 지역 선택이 유지된다", () => {
    addRegion(NONSAN);
    addRegion(JEJU);
    selectRegion(1);

    const store = removeRegion(NONSAN.sigunCode);

    expect(store.regions).toEqual([JEJU]);
    expect(store.currentIndex).toBe(0);
  });

  it("setConsent는 동의 버전만 갱신한다", () => {
    addRegion(NONSAN);
    const store = setConsent("consent-v1");

    expect(store.consentVersion).toBe("consent-v1");
    expect(store.regions).toEqual([NONSAN]);
    expect(loadRegionStore().consentVersion).toBe("consent-v1");
  });
});

describe("region-store 안전 초기화·마이그레이션 훅", () => {
  it("손상된 JSON이면 예외 없이 초기 상태로 시작한다", () => {
    window.localStorage.setItem(REGION_STORE_KEY, "{잘못된 json");

    expect(loadRegionStore()).toEqual(createEmptyRegionStore());
  });

  it("알 수 없는 schemaVersion이면 초기 상태로 시작한다", () => {
    window.localStorage.setItem(
      REGION_STORE_KEY,
      JSON.stringify({ schemaVersion: 99, regions: [] }),
    );

    expect(loadRegionStore()).toEqual(createEmptyRegionStore());
  });

  it("마이그레이션 훅은 현재 버전 페이로드를 정규화해 통과시킨다", () => {
    const migrated = migrateRegionStore({
      schemaVersion: 1,
      consentVersion: "consent-v1",
      regions: [NONSAN],
      currentIndex: 5,
    });

    expect(migrated).toEqual({
      schemaVersion: 1,
      consentVersion: "consent-v1",
      regions: [NONSAN],
      currentIndex: 0,
    });
  });

  it("마이그레이션 훅은 알 수 없는 버전·형태에 null을 돌려준다", () => {
    expect(migrateRegionStore({ schemaVersion: 2, regions: [] })).toBeNull();
    expect(
      migrateRegionStore({ schemaVersion: 1, regions: "없음" }),
    ).toBeNull();
    expect(migrateRegionStore("문자열")).toBeNull();
  });
});

describe("region-store 개인정보 최소화", () => {
  it("주소 원문·지역 이름은 어떤 키에도 저장되지 않는다", () => {
    const leaky = {
      ...NONSAN,
      label: "충남 논산시 시민로 210",
      address: "충남 논산시",
      sigunName: "논산시",
      query: "논산 시민로",
    } as unknown as StoredRegion;

    addRegion(leaky);
    setConsent("consent-v1");

    const raw = window.localStorage.getItem(REGION_STORE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("논산");
    expect(raw).not.toContain("시민로");

    const parsed = JSON.parse(raw as string) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "consentVersion",
      "currentIndex",
      "regions",
      "schemaVersion",
    ]);
    const regions = parsed.regions as Record<string, unknown>[];
    expect(regions).toHaveLength(1);
    expect(Object.keys(regions[0] as object).sort()).toEqual([
      "facCode",
      "sigunCode",
    ]);
  });

  it("mulsigye:v1 밖의 다른 키를 만들지 않는다", () => {
    addRegion(NONSAN);
    selectRegion(0);
    setConsent("consent-v1");

    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe(REGION_STORE_KEY);
  });
});

// 드래그의 접근성 대체(위로/아래로 이동)와 같은 연산이다. 맨 위가 기본 주소지이므로
// 순서 변경은 곧 대표 지역 변경이기도 하다.
describe("moveRegion", () => {
  const SANCHEONG: StoredRegion = {
    sigunCode: "48860",
    facCode: "4886010001",
  };

  function seedThree() {
    addRegion(NONSAN);
    addRegion(JEJU);
    addRegion(SANCHEONG);
  }

  it("항목을 위로 올린다", () => {
    seedThree();

    const store = moveRegion(2, 1);

    expect(store.regions.map((region) => region.sigunCode)).toEqual([
      NONSAN.sigunCode,
      SANCHEONG.sigunCode,
      JEJU.sigunCode,
    ]);
  });

  it("선택은 칸이 아니라 지역을 따라간다", () => {
    seedThree();
    selectRegion(0); // 논산을 보고 있다

    const store = moveRegion(2, 0);

    expect(store.regions[0]?.sigunCode).toBe(SANCHEONG.sigunCode);
    // 논산이 한 칸 밀렸으니 선택 인덱스도 함께 밀려야 계속 논산을 본다.
    expect(store.currentIndex).toBe(1);
  });

  it("범위를 벗어난 이동은 끝으로 자른다", () => {
    seedThree();

    const store = moveRegion(0, -3);

    expect(store.regions[0]?.sigunCode).toBe(NONSAN.sigunCode);
  });

  it("같은 자리로 옮기면 아무 것도 바뀌지 않는다", () => {
    seedThree();
    const before = loadRegionStore();

    const store = moveRegion(1, 1);

    expect(store.regions).toEqual(before.regions);
    expect(store.currentIndex).toBe(before.currentIndex);
  });

  it("빈 목록에서도 안전하다", () => {
    const store = moveRegion(0, 1);

    expect(store.regions).toEqual([]);
    expect(store.currentIndex).toBe(0);
  });
});
