// 농촌용수 저수지 수위 API(XML) 응답 파싱. fast-xml-parser + Zod로 경계를 검증한다.
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { parseNumericCell } from "./csv.ts";

export type WaterLevelObservation = {
  facCode: string;
  facName: string;
  observedOn: string;
  rate: number | null;
  waterLevel: number | null;
};

export type WaterLevelPage = {
  pageNo: number;
  numOfRows: number;
  totalCount: number;
  observations: WaterLevelObservation[];
};

export type WaterLevelParseResult =
  | { ok: true; page: WaterLevelPage }
  | { ok: false; reasonCode: string; message: string };

const stringCell = z.coerce.string().default("");

const itemSchema = z.object({
  check_date: z.coerce.string().regex(/^\d{8}$/),
  fac_code: z.coerce.string().regex(/^\d{10}$/),
  fac_name: z.coerce.string(),
  rate: stringCell,
  water_level: stringCell,
});

const responseSchema = z.object({
  response: z.object({
    header: z.object({
      returnReasonCode: z.coerce.string(),
      returnAuthMsg: z.coerce.string().default(""),
    }),
    body: z
      .object({
        item: z
          .preprocess(
            (value) =>
              value === undefined ? [] : Array.isArray(value) ? value : [value],
            z.array(itemSchema),
          )
          .default([]),
        pageNo: z.coerce.number().int().default(1),
        numOfRows: z.coerce.number().int().default(0),
        totalCount: z.coerce.number().int().default(0),
      })
      .optional(),
  }),
});

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // check_date 등을 문자열 그대로 유지한다.
  trimValues: true,
});

/** check_date `YYYYMMDD`(하이픈 없음, 실측) → KST 달력일 `YYYY-MM-DD`. */
const toCalendarDate = (checkDate: string): string =>
  `${checkDate.slice(0, 4)}-${checkDate.slice(4, 6)}-${checkDate.slice(6, 8)}`;

export function parseWaterLevelXml(
  xml: string | Uint8Array,
): WaterLevelParseResult {
  const text =
    typeof xml === "string" ? xml : new TextDecoder("utf-8").decode(xml);

  let parsedXml: unknown;
  try {
    parsedXml = parser.parse(text);
  } catch (error) {
    return {
      ok: false,
      reasonCode: "PARSE_ERROR",
      message: error instanceof Error ? error.message : "XML 파싱 실패",
    };
  }

  const parsed = responseSchema.safeParse(parsedXml);
  if (!parsed.success) {
    return {
      ok: false,
      reasonCode: "PARSE_ERROR",
      message: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }

  const { header, body } = parsed.data.response;
  if (header.returnReasonCode !== "00") {
    return {
      ok: false,
      reasonCode: header.returnReasonCode,
      message: header.returnAuthMsg,
    };
  }
  if (!body) {
    return {
      ok: false,
      reasonCode: "PARSE_ERROR",
      message: "정상 코드인데 body가 없습니다",
    };
  }

  return {
    ok: true,
    page: {
      pageNo: body.pageNo,
      numOfRows: body.numOfRows,
      totalCount: body.totalCount,
      observations: body.item.map((item) => ({
        facCode: item.fac_code,
        facName: item.fac_name.trim(),
        observedOn: toCalendarDate(item.check_date),
        rate: parseNumericCell(item.rate),
        waterLevel: parseNumericCell(item.water_level),
      })),
    },
  };
}
