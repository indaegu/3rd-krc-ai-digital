import { describe, expect, expectTypeOf, it } from "vitest";

import statusFloodDemo from "../examples/status.flood-demo.json" with { type: "json" };
import statusNormalDemo from "../examples/status.normal-demo.json" with { type: "json" };
import statusOk from "../examples/status.ok.json" with { type: "json" };
import statusSevereDemo from "../examples/status.severe-demo.json" with { type: "json" };
import statusStale from "../examples/status.stale.json" with { type: "json" };
import statusWatchDemo from "../examples/status.watch-demo.json" with { type: "json" };
import type { DroughtStageCode, StatusResponse } from "../src/index.js";

const round2 = (value: number): number => Math.round(value * 100) / 100;

describe("status contract fixtures", () => {
  it("keeps the success fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      sigunCode: "44230",
      sigunName: "논산시",
      reservoir: {
        facCode: "4423010045",
        name: "탑정",
        rate: 87.5,
        waterLevel: 32.1,
        observedOn: "2026-07-20",
      },
      region: {
        observedOn: "2026-07-20",
        regionalRate: 82.4,
        normalRate: 88.1,
        avgRatio: 93.5,
        officialStage: {
          code: "ok",
          label: "정상",
        },
      },
      highWaterNotice: false,
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["농촌용수 저수지 수위정보 조회", "논가뭄지도"],
      stale: false,
    } satisfies StatusResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<StatusResponse>();
    expect(statusOk).toEqual(contractFixture);
  });

  it("keeps the stale fixture on Supabase snapshot sources with avgRatio above 100", () => {
    const contractFixture = {
      schemaVersion: "1",
      sigunCode: "46170",
      sigunName: "나주시",
      reservoir: {
        facCode: "4617010001",
        name: "나주",
        rate: null,
        waterLevel: null,
        observedOn: null,
      },
      region: {
        observedOn: "2026-07-14",
        regionalRate: 91.2,
        normalRate: 65.1,
        avgRatio: 140.1,
        officialStage: {
          code: "ok",
          label: "정상",
        },
      },
      highWaterNotice: false,
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["Supabase 스냅샷", "논가뭄지도"],
      stale: true,
    } satisfies StatusResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<StatusResponse>();
    expect(statusStale).toEqual(contractFixture);
    expect(statusStale.stale).toBe(true);
    expect(statusStale.sources).toContain("Supabase 스냅샷");
    expect(statusStale.region.avgRatio).toBeGreaterThan(100);
  });

  it("keeps the official stage code union to the five UI tokens", () => {
    const codes = ["ok", "watch", "care", "alert", "crit"] as const;

    expectTypeOf<(typeof codes)[number]>().toEqualTypeOf<DroughtStageCode>();
  });

  it("requires highWaterNotice as a boolean on every status fixture", () => {
    expectTypeOf<StatusResponse["highWaterNotice"]>().toEqualTypeOf<boolean>();
  });
});

// 4개 상태 데모 픽스처 — product.md 상태 표(정상·가뭄 진행·심각 임박·장마 만수위)의
// 수치 명세와 산술 정합이어야 한다. 픽스처를 바꾸면 이 테스트도 함께 바꾼다.
describe("status demo fixtures — product.md 상태 표 4종", () => {
  /** 데모 status 조립 — satisfies로 생성 타입 정합을 함께 강제한다. */
  function demoStatus(input: {
    sigunCode: string;
    sigunName: string;
    facCode: string;
    reservoirName: string;
    rate: number;
    waterLevel: number;
    regionalRate: number;
    avgRatio: number;
    stage: StatusResponse["region"]["officialStage"];
    highWaterNotice: boolean;
  }) {
    return {
      schemaVersion: "1",
      sigunCode: input.sigunCode,
      sigunName: input.sigunName,
      reservoir: {
        facCode: input.facCode,
        name: input.reservoirName,
        rate: input.rate,
        waterLevel: input.waterLevel,
        observedOn: "2026-07-20",
      },
      region: {
        observedOn: "2026-07-20",
        regionalRate: input.regionalRate,
        normalRate: 80,
        avgRatio: input.avgRatio,
        officialStage: input.stage,
      },
      highWaterNotice: input.highWaterNotice,
      asOf: "2026-07-21T00:00:00.000Z",
      sources: ["농촌용수 저수지 수위정보 조회", "논가뭄지도"],
      stale: false,
    } satisfies StatusResponse;
  }

  const DEMOS = [
    {
      name: "정상",
      fixture: statusNormalDemo,
      expected: demoStatus({
        sigunCode: "44230",
        sigunName: "논산시",
        facCode: "4423010045",
        reservoirName: "탑정",
        rate: 84,
        waterLevel: 31.6,
        regionalRate: 82.4,
        avgRatio: 103,
        stage: { code: "ok", label: "정상" },
        highWaterNotice: false,
      }),
    },
    {
      name: "가뭄 진행",
      fixture: statusWatchDemo,
      expected: demoStatus({
        sigunCode: "46170",
        sigunName: "나주시",
        facCode: "4617010200",
        reservoirName: "나주호",
        rate: 57,
        waterLevel: 24.3,
        regionalRate: 54.4,
        avgRatio: 68,
        stage: { code: "watch", label: "관심" },
        highWaterNotice: false,
      }),
    },
    {
      name: "심각 임박",
      fixture: statusSevereDemo,
      expected: demoStatus({
        sigunCode: "50110",
        sigunName: "제주시",
        facCode: "5011010004",
        reservoirName: "상대",
        rate: 33,
        waterLevel: 4.1,
        regionalRate: 36.8,
        avgRatio: 46,
        stage: { code: "alert", label: "경계" },
        highWaterNotice: false,
      }),
    },
    {
      name: "장마 만수위",
      fixture: statusFloodDemo,
      expected: demoStatus({
        sigunCode: "26710",
        sigunName: "기장군",
        facCode: "2671010067",
        reservoirName: "병산",
        rate: 96,
        waterLevel: 14.9,
        regionalRate: 94.4,
        avgRatio: 118,
        stage: { code: "ok", label: "정상" },
        highWaterNotice: true,
      }),
    },
  ] as const;

  for (const demo of DEMOS) {
    it(`${demo.name}: 계약 정합 + 수치 명세(product.md) 일치`, () => {
      expectTypeOf(demo.expected).toMatchTypeOf<StatusResponse>();
      expect(demo.fixture).toEqual(demo.expected);
      // avgRatio는 정의상 통합저수율 ÷ 평년저수율 × 100과 맞아야 한다.
      expect(
        round2(
          (demo.expected.region.regionalRate /
            demo.expected.region.normalRate) *
            100,
        ),
      ).toBe(demo.expected.region.avgRatio);
    });
  }

  it("만수위 참고는 flood 데모에서만 true다 (rate 95 이상 + 상승 추세 시나리오)", () => {
    expect(statusFloodDemo.highWaterNotice).toBe(true);
    expect(statusFloodDemo.reservoir.rate).toBeGreaterThanOrEqual(95);
    for (const fixture of [
      statusNormalDemo,
      statusWatchDemo,
      statusSevereDemo,
    ]) {
      expect(fixture.highWaterNotice).toBe(false);
    }
  });
});
