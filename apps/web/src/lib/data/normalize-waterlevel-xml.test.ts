import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWaterLevelXml } from "./normalize-waterlevel-xml";

import { join } from "node:path";

const sampleXml = readFileSync(
  join(process.cwd(), "test", "fixtures", "krc-waterlevel-sample.xml"),
  "utf8",
);

describe("parseWaterLevelXml — 정상 응답(실측 샘플)", () => {
  const result = parseWaterLevelXml(sampleXml);

  it("returnReasonCode 00이면 ok=true로 파싱한다", () => {
    expect(result.ok).toBe(true);
  });

  it("check_date 20260714를 KST 달력일 2026-07-14로 변환한다", () => {
    if (!result.ok) throw new Error("정상 응답이어야 한다");
    expect(result.page.observations[0]).toEqual({
      facCode: "4423010045",
      facName: "탑정",
      observedOn: "2026-07-14",
      rate: 62.3,
      waterLevel: 27.62,
    });
  });

  it("totalCount·pageNo·numOfRows 페이징 값을 파싱한다", () => {
    if (!result.ok) throw new Error("정상 응답이어야 한다");
    expect(result.page.totalCount).toBe(7);
    expect(result.page.pageNo).toBe(1);
    expect(result.page.numOfRows).toBe(10);
    expect(result.page.observations).toHaveLength(7);
  });
});

describe("parseWaterLevelXml — 오류·경계 케이스", () => {
  it("returnReasonCode가 00이 아니면 오류로 매핑한다", () => {
    const xml =
      "<response><header><returnAuthMsg>SERVICE KEY IS NOT REGISTERED ERROR</returnAuthMsg>" +
      "<returnReasonCode>30</returnReasonCode></header></response>";
    const result = parseWaterLevelXml(xml);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("오류여야 한다");
    expect(result.reasonCode).toBe("30");
    expect(result.message).toContain("SERVICE KEY");
  });

  it("item이 하나여도 배열로 정규화한다", () => {
    const xml =
      "<response><body><item><check_date>20260720</check_date><county>충청남도 논산시 </county>" +
      "<fac_code>4423010045</fac_code><fac_name>탑정</fac_name><rate>60.4</rate>" +
      "<water_level>27.48</water_level></item><numOfRows>10</numOfRows><pageNo>1</pageNo>" +
      "<totalCount>1</totalCount></body><header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg>" +
      "<returnReasonCode>00</returnReasonCode></header></response>";
    const result = parseWaterLevelXml(xml);
    if (!result.ok) throw new Error("정상 응답이어야 한다");
    expect(result.page.observations).toHaveLength(1);
    expect(result.page.observations[0]?.observedOn).toBe("2026-07-20");
  });

  it("item이 없으면 빈 배열을 돌려준다", () => {
    const xml =
      "<response><body><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>0</totalCount></body>" +
      "<header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg>" +
      "<returnReasonCode>00</returnReasonCode></header></response>";
    const result = parseWaterLevelXml(xml);
    if (!result.ok) throw new Error("정상 응답이어야 한다");
    expect(result.page.observations).toEqual([]);
    expect(result.page.totalCount).toBe(0);
  });

  it("rate가 비어 있으면 null로 정규화한다", () => {
    const xml =
      "<response><body><item><check_date>20260720</check_date>" +
      "<fac_code>4423010045</fac_code><fac_name>탑정</fac_name><rate>-</rate>" +
      "<water_level></water_level></item><numOfRows>10</numOfRows><pageNo>1</pageNo>" +
      "<totalCount>1</totalCount></body><header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg>" +
      "<returnReasonCode>00</returnReasonCode></header></response>";
    const result = parseWaterLevelXml(xml);
    if (!result.ok) throw new Error("정상 응답이어야 한다");
    expect(result.page.observations[0]?.rate).toBeNull();
    expect(result.page.observations[0]?.waterLevel).toBeNull();
  });

  it("XML 구조가 깨졌으면 PARSE_ERROR로 매핑한다", () => {
    const result = parseWaterLevelXml("<response><body>깨진 응답");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("오류여야 한다");
    expect(result.reasonCode).toBe("PARSE_ERROR");
  });
});
