import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeCp949, decodeUtf8 } from "./encoding";

import { join } from "node:path";

// vitest는 apps/web을 cwd로 실행한다(jsdom 변환에서 import.meta.url이 불안정해 cwd 기준을 쓴다).
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "fixtures", name)));

describe("decodeCp949", () => {
  it("논가뭄지도 CP949 헤더를 한국어로 디코딩한다", () => {
    const text = decodeCp949(fixture("drought-map.head.csv"));
    expect(text.startsWith("기준일자,시도명,시군명,시군코드")).toBe(true);
  });

  it("시설제원 CP949 헤더를 한국어로 디코딩한다", () => {
    const text = decodeCp949(fixture("reservoir-spec.head.csv"));
    expect(text.startsWith("표준코드,본부,지사,시설명,소재지")).toBe(true);
  });
});

describe("decodeUtf8", () => {
  it("UTF-8 BOM을 제거한다", () => {
    const text = decodeUtf8(fixture("daily-rate.head.csv"));
    expect(text.startsWith("저수지명,위치,유효저수량")).toBe(true);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("BOM이 없으면 그대로 디코딩한다", () => {
    const bytes = new TextEncoder().encode("가나다");
    expect(decodeUtf8(bytes)).toBe("가나다");
  });
});
