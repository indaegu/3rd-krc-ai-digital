import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeReservoirSpec } from "./normalize-reservoir-spec";

import { join } from "node:path";

// vitest는 apps/web을 cwd로 실행한다(jsdom 변환에서 import.meta.url이 불안정해 cwd 기준을 쓴다).
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "fixtures", name)));

describe("normalizeReservoirSpec — 실데이터 앞부분 픽스처(CP949)", () => {
  const result = normalizeReservoirSpec(fixture("reservoir-spec.head.csv"));

  it("용천 2671010056 행을 내부 필드로 정규화한다", () => {
    const yongcheon = result.rows.find((row) => row.facCode === "2671010056");
    expect(yongcheon).toEqual({
      facCode: "2671010056",
      name: "용천",
      address: "부산광역시 기장군 일광읍 용천리",
      sigunCode: "26710",
      beneficiaryArea: 49,
      effectiveStorage: 115.29,
    });
  });

  it("sigunCode는 facCode 앞 5자리 유도값이다", () => {
    for (const row of result.rows) {
      expect(row.sigunCode).toBe(row.facCode.slice(0, 5));
    }
  });
});

describe("normalizeReservoirSpec — 케이스 픽스처(CP949)", () => {
  const result = normalizeReservoirSpec(
    fixture("reservoir-spec-cases.cp949.csv"),
  );

  it("탑정 수혜면적 5713을 숫자로 정규화한다", () => {
    const tapjeong = result.rows.find((row) => row.facCode === "4423010045");
    expect(tapjeong?.beneficiaryArea).toBe(5713);
    expect(tapjeong?.sigunCode).toBe("44230");
  });

  it("수혜면적 '-'는 null로 정규화한다", () => {
    const fake = result.rows.find((row) => row.facCode === "4415010001");
    expect(fake?.beneficiaryArea).toBeNull();
  });

  it("따옴표 안 쉼표가 있는 소재지를 한 필드로 유지한다", () => {
    const fake = result.rows.find((row) => row.facCode === "4415010001");
    expect(fake?.address).toBe("충청남도 공주시 계룡면, 어딘가");
  });

  it("10자리가 아닌 표준코드는 invalid_value로 격리한다", () => {
    const invalid = result.quarantined.find(
      (q) => q.reason === "invalid_value",
    );
    expect(invalid?.raw[0]).toBe("123456789");
    expect(result.rows.some((row) => row.facCode === "123456789")).toBe(false);
  });
});
