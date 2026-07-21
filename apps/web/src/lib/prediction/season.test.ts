import { describe, expect, it } from "vitest";
import { seasonOf } from "./season.ts";

describe("seasonOf — KST 월 기준 3–5 봄 / 6–8 여름 / 9–11 가을 / 12–2 겨울", () => {
  it.each([
    ["2026-01-15", "winter"],
    ["2026-02-28", "winter"],
    ["2026-03-01", "spring"], // 경계
    ["2026-04-10", "spring"],
    ["2026-05-31", "spring"], // 경계
    ["2026-06-01", "summer"], // 경계
    ["2026-07-22", "summer"],
    ["2026-08-31", "summer"], // 경계
    ["2026-09-01", "autumn"], // 경계
    ["2026-10-15", "autumn"],
    ["2026-11-30", "autumn"], // 경계
    ["2026-12-01", "winter"], // 경계
  ] as const)("%s → %s", (kstDate, season) => {
    expect(seasonOf(kstDate)).toBe(season);
  });

  it("형식이 아니거나 월이 범위 밖이면 명시적 에러", () => {
    expect(() => seasonOf("2026/07/22")).toThrow();
    expect(() => seasonOf("2026-13-01")).toThrow();
    expect(() => seasonOf("2026-00-01")).toThrow();
    expect(() => seasonOf("")).toThrow();
  });

  it("결정성: 같은 입력 2회 호출 동일 출력", () => {
    expect(seasonOf("2026-07-22")).toBe(seasonOf("2026-07-22"));
  });
});
