import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeDroughtMap } from "./normalize-drought-map";

import { join } from "node:path";

// vitest는 apps/web을 cwd로 실행한다(jsdom 변환에서 import.meta.url이 불안정해 cwd 기준을 쓴다).
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "fixtures", name)));

describe("normalizeDroughtMap — 실데이터 앞부분 픽스처(CP949)", () => {
  const result = normalizeDroughtMap(fixture("drought-map.head.csv"));

  it("기장군 26710 행을 내부 필드로 정규화한다", () => {
    const gijang = result.rows.find((row) => row.sigunCode === "26710");
    expect(gijang).toEqual({
      observedOn: "2025-01-01",
      sidoName: "부산",
      sigunName: "기장군",
      sigunCode: "26710",
      regionalRate: 89.7,
      normalRate: 85.7,
      avgRatio: 104.6,
      officialStage: "정상",
    });
  });

  it("서울 등 저수율=0·평년=0 플레이스홀더 행을 격리한다", () => {
    const placeholder = result.quarantined.filter(
      (q) => q.reason === "placeholder_region",
    );
    expect(placeholder.length).toBeGreaterThan(0);
    expect(placeholder.some((q) => q.raw[3] === "11000")).toBe(true);
    expect(result.rows.some((row) => row.sigunCode === "11000")).toBe(false);
  });

  it("모든 입력 행이 rows 또는 quarantined 정확히 한 곳에 들어간다", () => {
    const lineCount = 163; // 픽스처의 데이터 행 수(헤더 제외)
    expect(result.rows.length + result.quarantined.length).toBe(lineCount);
  });
});

describe("normalizeDroughtMap — 경계·격리 케이스 픽스처(CP949)", () => {
  const result = normalizeDroughtMap(fixture("drought-map-cases.cp949.csv"));
  const bySigun = (code: string) =>
    result.rows.find((row) => row.sigunCode === code);

  it("경계값: avgRatio 70.0 → 관심, 70.1 → 정상", () => {
    expect(bySigun("44230")?.officialStage).toBe("관심");
    expect(bySigun("44230")?.avgRatio).toBe(70);
    expect(bySigun("44150")?.officialStage).toBe("정상");
    expect(bySigun("44150")?.avgRatio).toBe(70.1);
  });

  it("경계값: 60.0 → 주의, 60.1 → 관심", () => {
    expect(bySigun("52210")?.officialStage).toBe("주의");
    expect(bySigun("52180")?.officialStage).toBe("관심");
  });

  it("경계값: 50.0 → 경계, 50.1 → 주의", () => {
    expect(bySigun("47250")?.officialStage).toBe("경계");
    expect(bySigun("47280")?.officialStage).toBe("주의");
  });

  it("경계값: 40.0 → 심각, 40.1 → 경계", () => {
    expect(bySigun("48270")?.officialStage).toBe("심각");
    expect(bySigun("48330")?.officialStage).toBe("경계");
  });

  it("avgRatio 140.1(100 초과 실측)을 잘라내지 않고 보존한다", () => {
    expect(bySigun("46170")?.avgRatio).toBe(140.1);
  });

  it("원천 가뭄단계와 계산 단계가 다르면 stage_mismatch로 격리한다", () => {
    const mismatch = result.quarantined.find(
      (q) => q.reason === "stage_mismatch",
    );
    expect(mismatch?.raw[3]).toBe("51110"); // avgRatio 90인데 관심으로 표기된 행
    expect(bySigun("51110")).toBeUndefined();
  });

  it("음수 저수율 행은 negative_rate로 격리한다", () => {
    const negative = result.quarantined.find(
      (q) => q.reason === "negative_rate",
    );
    expect(negative?.raw[3]).toBe("51130");
  });

  it("저수율 '-'는 null로 정규화하되 행은 유지한다", () => {
    const gangneung = bySigun("51150");
    expect(gangneung?.regionalRate).toBeNull();
    expect(gangneung?.normalRate).toBe(70);
  });

  it("avgRatio가 비어 있으면 invalid_value로 격리한다", () => {
    const invalid = result.quarantined.find(
      (q) => q.reason === "invalid_value",
    );
    expect(invalid?.raw[3]).toBe("51210");
  });

  it("격리 요약: rows 10건 + quarantined 4건", () => {
    expect(result.rows).toHaveLength(10);
    expect(result.quarantined).toHaveLength(4);
  });
});
