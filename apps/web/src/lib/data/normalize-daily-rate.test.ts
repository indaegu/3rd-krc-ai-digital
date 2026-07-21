import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeDailyRate } from "./normalize-daily-rate";
import { normalizeReservoirSpec } from "./normalize-reservoir-spec";
import type { ReservoirSpec } from "./normalize-reservoir-spec";

import { join } from "node:path";

// vitest는 apps/web을 cwd로 실행한다(jsdom 변환에서 import.meta.url이 불안정해 cwd 기준을 쓴다).
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "fixtures", name)));

const utf8WithBom = (text: string) =>
  new TextEncoder().encode(String.fromCharCode(0xfeff) + text);

const spec = (overrides: Partial<ReservoirSpec>): ReservoirSpec => ({
  facCode: "1111010001",
  name: "가상",
  address: "주소 A",
  sigunCode: "11110",
  beneficiaryArea: 10,
  effectiveStorage: 100,
  ...overrides,
});

describe("normalizeDailyRate — 실데이터 앞부분 픽스처(UTF-8 BOM)", () => {
  const specs = normalizeReservoirSpec(fixture("reservoir-spec.head.csv")).rows;
  const result = normalizeDailyRate(fixture("daily-rate.head.csv"), specs);

  it("(저수지명, 위치) 정확 일치로 시설제원과 조인해 facCode를 얻는다", () => {
    expect(result.rows[0]).toEqual({
      facCode: "2671010056", // 용천
      observedOn: "2025-01-01",
      rate: 75.7,
    });
    expect(result.rows.some((row) => row.facCode === "2671010067")).toBe(true); // 병산
  });

  it("날짜 열이 wide→long으로 풀리고 전부 YYYY-MM-DD다", () => {
    expect(result.rows.length).toBeGreaterThan(300);
    for (const row of result.rows) {
      expect(row.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("픽스처의 두 시설 모두 매칭되어 no_spec_match가 없다", () => {
    expect(
      result.quarantined.filter((q) => q.reason === "no_spec_match"),
    ).toHaveLength(0);
  });
});

describe("normalizeDailyRate — 합성 케이스", () => {
  it("빈 셀은 결측으로 행을 만들지 않는다", () => {
    const bytes = utf8WithBom(
      "저수지명,위치,유효저수량,2025-01-01,2025-01-02,2025-01-03\n가상,주소 A,100,50.5,,49\n",
    );
    const result = normalizeDailyRate(bytes, [spec({})]);
    expect(result.rows).toEqual([
      { facCode: "1111010001", observedOn: "2025-01-01", rate: 50.5 },
      { facCode: "1111010001", observedOn: "2025-01-03", rate: 49 },
    ]);
    expect(result.quarantined).toHaveLength(0);
  });

  it("음수 저수율 셀은 negative_rate로 격리하고 나머지 셀은 유지한다", () => {
    const bytes = utf8WithBom(
      "저수지명,위치,유효저수량,2025-01-01,2025-01-02\n가상,주소 A,100,-3,50\n",
    );
    const result = normalizeDailyRate(bytes, [spec({})]);
    expect(result.rows).toEqual([
      { facCode: "1111010001", observedOn: "2025-01-02", rate: 50 },
    ]);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0]?.reason).toBe("negative_rate");
    expect(result.quarantined[0]?.detail).toContain("2025-01-01");
  });

  it("시설제원에 없는 (이름, 위치)는 no_spec_match로 격리한다", () => {
    const bytes = utf8WithBom(
      "저수지명,위치,유효저수량,2025-01-01\n미지,어딘가,10,80\n",
    );
    const result = normalizeDailyRate(bytes, [spec({})]);
    expect(result.rows).toHaveLength(0);
    expect(result.quarantined[0]?.reason).toBe("no_spec_match");
  });

  it("동명·동위치 시설이 여럿이면 ambiguous_join으로 격리한다", () => {
    const bytes = utf8WithBom(
      "저수지명,위치,유효저수량,2025-01-01\n가상,주소 A,10,80\n",
    );
    const result = normalizeDailyRate(bytes, [
      spec({ facCode: "1111010001" }),
      spec({ facCode: "1111010002" }),
    ]);
    expect(result.rows).toHaveLength(0);
    expect(result.quarantined[0]?.reason).toBe("ambiguous_join");
  });

  it("일별 CSV 안에서 같은 (이름, 위치)가 반복되면 두 번째부터 격리한다", () => {
    const bytes = utf8WithBom(
      "저수지명,위치,유효저수량,2025-01-01\n가상,주소 A,10,80\n가상,주소 A,10,81\n",
    );
    const result = normalizeDailyRate(bytes, [spec({})]);
    expect(result.rows).toHaveLength(1);
    expect(result.quarantined[0]?.reason).toBe("ambiguous_join");
  });
});
