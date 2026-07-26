import { describe, expect, expectTypeOf, it } from "vitest";

import regionsResolveNotReady from "../examples/regions-resolve.not-ready.json" with { type: "json" };
import regionsResolveOk from "../examples/regions-resolve.ok.json" with { type: "json" };
import regionsSearchOk from "../examples/regions-search.ok.json" with { type: "json" };
import type {
  RegionResolveRequest,
  RegionResolveResponse,
  RegionSearchResponse,
} from "../src/index.js";

describe("regions contract fixtures", () => {
  it("keeps the search fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      candidates: [
        {
          label: "전라남도 나주시 시청길 22 (송월동)",
          admCd: "1217010200",
          legalCode: "4617010200",
          // 읍·면·동/리는 resolve에 실어 시군 안에서 대표 저수지를 좁히는 데 쓴다.
          // 클라이언트가 이 값을 흘리면 넓은 시군에서 늘 같은 저수지가 뽑힌다.
          emdNm: "송월동",
          liNm: "",
        },
      ],
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["도로명주소 API"],
      stale: false,
    } satisfies RegionSearchResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<RegionSearchResponse>();
    expect(regionsSearchOk).toEqual(contractFixture);
  });

  it("keeps admCd plus legalCode as the only required resolve request fields", () => {
    const contractFixture = {
      admCd: "1217010200",
      legalCode: "4617010200",
    } satisfies RegionResolveRequest;

    expectTypeOf(contractFixture).toMatchTypeOf<RegionResolveRequest>();
  });

  it("allows locality and a chosen reservoir on the resolve request (v1 additive)", () => {
    // 좌표가 없어 거리는 계산하지 않는다 — 읍·면·동/리로만 좁힌다(data-sources.md).
    const narrowed = {
      admCd: "5011025924",
      legalCode: "5011025924",
      emdNm: "조천읍",
      liNm: "함덕리",
    } satisfies RegionResolveRequest;
    expectTypeOf(narrowed).toMatchTypeOf<RegionResolveRequest>();

    // 사용자가 저수지 이름으로 직접 고른 경우.
    const chosen = {
      admCd: "5011025924",
      legalCode: "5011025924",
      facCode: "5011010007",
    } satisfies RegionResolveRequest;
    expect(chosen.facCode).toMatch(/^[0-9]{10}$/);
  });

  it("keeps the resolve success fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      sigunCode: "44230",
      sigunName: "논산시",
      prepared: true,
      reservoir: {
        facCode: "4423010045",
        name: "탑정",
      },
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["농업기반시설 시설제원_저수지"],
      stale: false,
    } satisfies RegionResolveResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<RegionResolveResponse>();
    expect(regionsResolveOk).toEqual(contractFixture);
  });

  it("keeps the not-ready fixture prepared=false with a null reservoir", () => {
    const contractFixture = {
      schemaVersion: "1",
      sigunCode: "27260",
      sigunName: null,
      prepared: false,
      reservoir: null,
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["농업기반시설 시설제원_저수지"],
      stale: false,
    } satisfies RegionResolveResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<RegionResolveResponse>();
    expect(regionsResolveNotReady).toEqual(contractFixture);
    expect(regionsResolveNotReady.prepared).toBe(false);
    expect(regionsResolveNotReady.reservoir).toBeNull();
  });
});
