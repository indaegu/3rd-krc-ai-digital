// coach-context 테스트 — 상태·예측 결과 → 비식별 CoachFactPacket 순수 조립.
// 비식별 계약(플랜 Global Constraints): 패킷에 sigunCode·지역명·주소·정확한 수치를
// 넣지 않는다. 스키마 상수(factSchemaVersion "1", reachBucket enum의 7/14/30)만
// 예외로 두고 나머지 직렬화에 숫자가 없음을 강제한다.
import type { ForecastResponse, StatusResponse } from "@mulsigye/contracts";
import { describe, expect, it } from "vitest";
import { buildCoachFactPacket } from "./coach-context.ts";

const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");

type StageDto = StatusResponse["region"]["officialStage"];

const STAGES: readonly StageDto[] = [
  { code: "ok", label: "정상" },
  { code: "watch", label: "관심" },
  { code: "care", label: "주의" },
  { code: "alert", label: "경계" },
  { code: "crit", label: "심각" },
];

function makeStatus(
  officialStage: StageDto,
  avgRatio: number,
  highWaterNotice = false,
): StatusResponse {
  return {
    schemaVersion: "1",
    sigunCode: "44230",
    sigunName: "논산시",
    reservoir: {
      facCode: "4423010045",
      name: "탑정",
      rate: 60.4,
      waterLevel: 27.48,
      observedOn: "2026-07-20",
    },
    region: {
      observedOn: "2026-07-20",
      regionalRate: 55.1,
      normalRate: 80,
      avgRatio,
      officialStage,
    },
    highWaterNotice,
    asOf: FIXED_NOW.toISOString(),
    sources: ["농촌용수 저수지 수위정보 조회", "논가뭄지도"],
    stale: false,
  };
}

function makeForecast(overrides: {
  reachBucket?: ForecastResponse["reach"]["bucket"];
  trendBucket?: ForecastResponse["trend"]["bucket"];
}): ForecastResponse {
  return {
    schemaVersion: "1",
    sigunCode: "44230",
    sigunName: "논산시",
    basis: {
      observedOn: "2026-07-20",
      avgRatio: 68,
      officialStage: { code: "watch", label: "관심" },
    },
    history: [{ observedOn: "2026-07-20", avgRatio: 68 }],
    forecast: [
      { observedOn: "2026-07-21", avgRatio: 68, low: 65.2, high: 70.9 },
    ],
    trend: { dailyDelta: -0.45, bucket: overrides.trendBucket ?? "falling" },
    reach: {
      days: 18,
      bucket: overrides.reachBucket ?? "within_30d",
      targetStage: { code: "care", label: "주의" },
    },
    model: {
      name: "naive",
      version: "pred-v1",
      mae7: 1.9168,
      mae14: 2.8337,
      bandMethod: "residual_quantile_p10_p90",
    },
    officialOutlook: null,
    asOf: FIXED_NOW.toISOString(),
    sources: ["논가뭄지도"],
    stale: false,
  };
}

function makeInput(
  overrides: Partial<{
    status: StatusResponse;
    forecast: ForecastResponse;
    now: Date;
  }> = {},
) {
  return {
    status:
      overrides.status ?? makeStatus({ code: "watch", label: "관심" }, 68),
    forecast: overrides.forecast ?? makeForecast({}),
    now: overrides.now ?? FIXED_NOW,
  };
}

describe("buildCoachFactPacket — 사실 매핑", () => {
  it("공인 단계 5종의 라벨을 그대로 담는다", () => {
    for (const stage of STAGES) {
      const packet = buildCoachFactPacket(
        makeInput({ status: makeStatus(stage, 68) }),
      );
      expect(packet.officialStage).toBe(stage.label);
    }
  });

  it("season은 KST 월 기준(7월 → 여름, KST 자정 경계 포함)", () => {
    expect(buildCoachFactPacket(makeInput()).season).toBe("여름");
    // UTC 2026-11-30 15:30 = KST 2026-12-01 00:30 → 겨울(KST 경계).
    expect(
      buildCoachFactPacket(
        makeInput({ now: new Date("2026-11-30T15:30:00.000Z") }),
      ).season,
    ).toBe("겨울");
    expect(
      buildCoachFactPacket(
        makeInput({ now: new Date("2026-04-10T00:00:00.000Z") }),
      ).season,
    ).toBe("봄");
    expect(
      buildCoachFactPacket(
        makeInput({ now: new Date("2026-10-10T00:00:00.000Z") }),
      ).season,
    ).toBe("가을");
  });

  it("reachBucket·trendBucket은 forecast 결과를 그대로 쓴다", () => {
    const packet = buildCoachFactPacket(
      makeInput({
        forecast: makeForecast({
          reachBucket: "within_14d",
          trendBucket: "rising",
        }),
      }),
    );
    expect(packet.reachBucket).toBe("within_14d");
    expect(packet.trendBucket).toBe("rising");
  });

  it("만수위 참고: status가 확정한 highWaterNotice를 그대로 옮긴다(재판정 금지)", () => {
    const truthy = makeInput({
      status: makeStatus({ code: "ok", label: "정상" }, 118, true),
    });
    expect(buildCoachFactPacket(truthy).highWaterNotice).toBe(true);
    const falsy = makeInput({
      status: makeStatus({ code: "watch", label: "관심" }, 68, false),
    });
    expect(buildCoachFactPacket(falsy).highWaterNotice).toBe(false);
  });

  it("officialOutlookCode는 이번 단계 null 고정, actions는 coach-service가 채운다", () => {
    const packet = buildCoachFactPacket(makeInput());
    expect(packet.officialOutlookCode).toBeNull();
    expect(packet.actions).toEqual([]);
    expect(packet.factSchemaVersion).toBe("1");
  });
});

describe("buildCoachFactPacket — 비식별 계약", () => {
  it("패킷 키는 CoachFactPacket 스키마 필드뿐이다", () => {
    const packet = buildCoachFactPacket(makeInput());
    expect(Object.keys(packet).sort()).toEqual([
      "actions",
      "factSchemaVersion",
      "highWaterNotice",
      "officialOutlookCode",
      "officialStage",
      "reachBucket",
      "season",
      "trendBucket",
    ]);
  });

  it("스키마 상수를 제외한 fact 필드 직렬화에 숫자가 없다", () => {
    const packet = buildCoachFactPacket(
      makeInput({
        status: makeStatus({ code: "ok", label: "정상" }, 118, true),
      }),
    );
    // factSchemaVersion("1")·reachBucket(within_7d 등)은 닫힌 스키마 상수라
    // 숫자 검사에서 제외하되, 값이 닫힌 어휘 안에 있음을 별도로 단언한다.
    const { factSchemaVersion, reachBucket, ...measured } = packet;
    expect(factSchemaVersion).toBe("1");
    expect(["none", "within_7d", "within_14d", "within_30d"]).toContain(
      reachBucket,
    );
    expect(JSON.stringify(measured)).not.toMatch(/\d/);
  });

  it("sigunCode·지역명·저수지명·관측 수치가 직렬화에 없다", () => {
    const packet = buildCoachFactPacket(makeInput());
    const serialized = JSON.stringify(packet);
    expect(serialized).not.toContain("44230");
    expect(serialized).not.toContain("논산");
    expect(serialized).not.toContain("탑정");
    expect(serialized).not.toContain("68");
    expect(serialized).not.toContain("60.4");
  });
});
