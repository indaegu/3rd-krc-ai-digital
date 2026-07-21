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
        },
      ],
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["도로명주소 API"],
      stale: false,
    } satisfies RegionSearchResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<RegionSearchResponse>();
    expect(regionsSearchOk).toEqual(contractFixture);
  });

  it("keeps the resolve request contract to admCd plus legalCode only", () => {
    const contractFixture = {
      admCd: "1217010200",
      legalCode: "4617010200",
    } satisfies RegionResolveRequest;

    expectTypeOf(contractFixture).toMatchTypeOf<RegionResolveRequest>();
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
