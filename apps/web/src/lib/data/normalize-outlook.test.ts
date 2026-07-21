import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeOutlook } from "./normalize-outlook";

import { join } from "node:path";

// vitest는 apps/web을 cwd로 실행한다(jsdom 변환에서 import.meta.url이 불안정해 cwd 기준을 쓴다).
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "fixtures", name)));

describe("normalizeOutlook — 실데이터 앞부분 픽스처(CP949)", () => {
  const result = normalizeOutlook(fixture("outlook.head.csv"));

  it("논산시 44230 행을 내부 필드로 정규화한다", () => {
    const nonsan = result.rows.find(
      (row) => row.sigunCode === "44230" && row.publishedOn === "2025-01-02",
    );
    expect(nonsan).toEqual({
      publishedOn: "2025-01-02",
      sidoName: "충남",
      sigunName: "논산시",
      sigunCode: "44230",
      currentLevel: 0,
      outlook1m: 0,
      outlook2m: 0,
      outlook3m: 0,
    });
  });

  it("월 발행일을 그대로 보존한다", () => {
    for (const row of result.rows) {
      expect(row.publishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("픽스처 행은 전부 0~4 범위라 격리가 없다", () => {
    expect(result.quarantined).toHaveLength(0);
  });
});

describe("normalizeOutlook — 케이스 픽스처(CP949)", () => {
  const result = normalizeOutlook(fixture("outlook-cases.cp949.csv"));

  it("0~4 코드를 숫자로 보존한다", () => {
    const nonsan = result.rows.find((row) => row.sigunCode === "44230");
    expect(nonsan?.currentLevel).toBe(1);
    expect(nonsan?.outlook1m).toBe(2);
    expect(nonsan?.outlook2m).toBe(3);
    expect(nonsan?.outlook3m).toBe(4);
  });

  it("0~4 범위 밖(5, -1)과 비숫자(x)는 outlook_out_of_range로 격리한다", () => {
    const reasons = result.quarantined.map((q) => q.reason);
    expect(reasons).toEqual([
      "outlook_out_of_range",
      "outlook_out_of_range",
      "outlook_out_of_range",
    ]);
    const codes = result.quarantined.map((q) => q.raw[3]);
    expect(codes).toEqual(["26710", "27710", "28710"]);
    expect(result.rows).toHaveLength(2);
  });
});
