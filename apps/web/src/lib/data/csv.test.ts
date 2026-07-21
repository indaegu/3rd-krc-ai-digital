import { describe, expect, it } from "vitest";
import { parseCsv, parseNumericCell } from "./csv";

describe("parseCsv", () => {
  it("쉼표로 구분된 행을 파싱한다", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("CRLF 줄바꿈을 처리한다", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("따옴표 안의 쉼표를 필드 값으로 유지한다", () => {
    expect(parseCsv('name,"a, b",c')).toEqual([["name", "a, b", "c"]]);
  });

  it('이스케이프된 따옴표("")를 따옴표 하나로 파싱한다', () => {
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
  });

  it("따옴표 안의 줄바꿈을 필드 값으로 유지한다", () => {
    expect(parseCsv('"line1\nline2",x')).toEqual([["line1\nline2", "x"]]);
  });

  it("빈 필드를 빈 문자열로 유지한다", () => {
    expect(parseCsv("a,,c\n,,\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("마지막 줄바꿈 뒤 빈 행을 만들지 않는다", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
  });
});

describe("parseNumericCell", () => {
  it("숫자 문자열을 숫자로 바꾼다", () => {
    expect(parseNumericCell("89.7")).toBe(89.7);
    expect(parseNumericCell("0")).toBe(0);
    expect(parseNumericCell("140.1")).toBe(140.1);
  });

  it("음수는 숫자로 유지한다(격리 판단은 호출자 몫)", () => {
    expect(parseNumericCell("-5")).toBe(-5);
  });

  it("빈값·하이픈·비숫자는 null로 정규화한다", () => {
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell("-")).toBeNull();
    expect(parseNumericCell("x")).toBeNull();
    expect(parseNumericCell(" ")).toBeNull();
  });
});
