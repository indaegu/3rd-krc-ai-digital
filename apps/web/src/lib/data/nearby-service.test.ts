// nearby-service 순수 조립 테스트 — 결정적 스냅샷으로 같은 시·도 필터·정렬·current·not_prepared를 강제한다.
import { describe, expect, it } from "vitest";
import { buildNearby, type NearbySnapshotRow } from "./nearby-service";

/** 테스트용 스냅샷 — 지역별 여러 날짜를 섞어 '최신 행만' 골라내는지 검증한다. */
const SNAPSHOT: readonly NearbySnapshotRow[] = [
  // 충남 논산 — 오래된 행과 최신 행(최신이 avgRatio 112.7).
  {
    observedOn: "2025-12-30",
    sidoName: "충남",
    sigunName: "논산시",
    sigunCode: "44230",
    avgRatio: 40,
    officialStage: "심각",
  },
  {
    observedOn: "2025-12-31",
    sidoName: "충남",
    sigunName: "논산시",
    sigunCode: "44230",
    avgRatio: 112.7,
    officialStage: "정상",
  },
  // 충남 당진 — 가장 가뭄이 심함(avgRatio 71.9).
  {
    observedOn: "2025-12-29",
    sidoName: "충남",
    sigunName: "당진시",
    sigunCode: "44270",
    avgRatio: 71.9,
    officialStage: "정상",
  },
  // 충남 서산 — 논산과 avgRatio 동률(112.7)로 이름 tie-break 검증.
  {
    observedOn: "2025-12-28",
    sidoName: "충남",
    sigunName: "서산시",
    sigunCode: "44210",
    avgRatio: 112.7,
    officialStage: "정상",
  },
  // 다른 시·도(전남 나주) — 필터에서 빠져야 한다.
  {
    observedOn: "2025-12-31",
    sidoName: "전남",
    sigunName: "나주시",
    sigunCode: "46170",
    avgRatio: 55,
    officialStage: "주의",
  },
];

describe("buildNearby", () => {
  it("같은 시·도만 추리고 다른 시·도는 제외한다", () => {
    const result = buildNearby("44230", { snapshot: SNAPSHOT });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("ok 기대");
    expect(result.body.sidoName).toBe("충남");
    expect(result.body.regions.every((r) => r.sigunCode !== "46170")).toBe(
      true,
    );
    expect(result.body.regions).toHaveLength(3);
  });

  it("가뭄 심한 순(avgRatio 오름차순)으로 정렬하고 동률은 이름순으로 깬다", () => {
    const result = buildNearby("44230", { snapshot: SNAPSHOT });
    if (result.kind !== "ok") throw new Error("ok 기대");
    // 당진(71.9) → 논산(112.7) → 서산(112.7): 동률은 이름순(논산 < 서산).
    expect(result.body.regions.map((r) => r.sigunName)).toEqual([
      "당진시",
      "논산시",
      "서산시",
    ]);
  });

  it("요청 지역만 current=true로 표시한다", () => {
    const result = buildNearby("44230", { snapshot: SNAPSHOT });
    if (result.kind !== "ok") throw new Error("ok 기대");
    const current = result.body.regions.filter((r) => r.current);
    expect(current).toHaveLength(1);
    expect(current[0]?.sigunCode).toBe("44230");
  });

  it("지역별 최신 행만 쓰고 officialStage를 그대로 매핑한다", () => {
    const result = buildNearby("44230", { snapshot: SNAPSHOT });
    if (result.kind !== "ok") throw new Error("ok 기대");
    const nonsan = result.body.regions.find((r) => r.sigunCode === "44230");
    // 최신(12-31, 정상)을 써야지 오래된(12-30, 심각)을 쓰면 안 된다.
    expect(nonsan?.avgRatio).toBe(112.7);
    expect(nonsan?.stageCode).toBe("ok");
  });

  it("asOf는 시·도 안 최신 observedOn이고 stale=true·커밋 스냅샷 source다", () => {
    const result = buildNearby("44230", { snapshot: SNAPSHOT });
    if (result.kind !== "ok") throw new Error("ok 기대");
    expect(result.body.asOf).toBe("2025-12-31");
    expect(result.body.stale).toBe(true);
    expect(result.body.sources).toEqual(["커밋 스냅샷(기준 2025-12-31)"]);
  });

  it("스냅샷에 없는 지역은 not_prepared다", () => {
    const result = buildNearby("99999", { snapshot: SNAPSHOT });
    expect(result.kind).toBe("not_prepared");
  });

  it("빈 스냅샷은 unavailable이다", () => {
    const result = buildNearby("44230", { snapshot: [] });
    expect(result.kind).toBe("unavailable");
  });

  it("커밋 스냅샷(주입 없음)으로 충남 논산 44230을 실제 조립한다", () => {
    const result = buildNearby("44230");
    if (result.kind !== "ok") throw new Error("ok 기대");
    expect(result.body.sidoName).toBe("충남");
    expect(result.body.regions.length).toBeGreaterThan(1);
    // 실제 스냅샷에서도 요청 지역이 정확히 하나 current로 잡힌다.
    expect(result.body.regions.filter((r) => r.current)).toHaveLength(1);
    // 정렬 불변식: avgRatio 비내림차순.
    const ratios = result.body.regions.map((r) => r.avgRatio);
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1]!);
    }
  });
});
