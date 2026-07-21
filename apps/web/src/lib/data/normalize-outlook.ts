// 가뭄예경보자료(CP949 연간 CSV) → 월별 공식 전망 정규화.
// 전망 값은 0~4 코드(포털 공식 정의: 0=정상 … 4=심각). 라벨 변환은 drought-stage.ts 한 곳에서만 한다.
import { parseCsv, parseNumericCell } from "./csv";
import { decodeCp949 } from "./encoding";
import { makeQuarantined, type NormalizeResult } from "./quarantine";

export type OfficialOutlookRow = {
  publishedOn: string;
  sidoName: string;
  sigunName: string;
  sigunCode: string;
  currentLevel: number;
  outlook1m: number;
  outlook2m: number;
  outlook3m: number;
};

const EXPECTED_HEADER = [
  "기준일자",
  "시도명",
  "시군명",
  "행정구역코드",
  "가뭄현황",
  "가뭄전망1",
  "가뭄전망2",
  "가뭄전망3",
] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SIGUN_CODE_PATTERN = /^\d{5}$/;

const parseOutlookCode = (cell: string): number | null => {
  const value = parseNumericCell(cell);
  if (value === null || !Number.isInteger(value) || value < 0 || value > 4) {
    return null;
  }
  return value;
};

export function normalizeOutlook(
  bytes: Uint8Array,
): NormalizeResult<OfficialOutlookRow> {
  const records = parseCsv(decodeCp949(bytes));
  const header = records[0];
  if (!header || header.join(",") !== EXPECTED_HEADER.join(",")) {
    throw new Error(
      `가뭄예경보 헤더가 예상과 다릅니다: ${header?.join(",") ?? "(없음)"}`,
    );
  }

  const result: NormalizeResult<OfficialOutlookRow> = {
    rows: [],
    quarantined: [],
  };

  for (let i = 1; i < records.length; i += 1) {
    const raw = records[i];
    if (!raw) continue;
    const line = i + 1;

    if (raw.length !== EXPECTED_HEADER.length) {
      result.quarantined.push(
        makeQuarantined("invalid_row", line, raw, "열 수 불일치"),
      );
      continue;
    }

    const [publishedOn, sidoName, sigunName, sigunCode] = raw as [
      string,
      string,
      string,
      string,
    ];
    if (
      !DATE_PATTERN.test(publishedOn) ||
      !SIGUN_CODE_PATTERN.test(sigunCode)
    ) {
      result.quarantined.push(
        makeQuarantined(
          "invalid_value",
          line,
          raw,
          "기준일자·행정구역코드 형식",
        ),
      );
      continue;
    }

    const currentLevel = parseOutlookCode(raw[4] ?? "");
    const outlook1m = parseOutlookCode(raw[5] ?? "");
    const outlook2m = parseOutlookCode(raw[6] ?? "");
    const outlook3m = parseOutlookCode(raw[7] ?? "");
    if (
      currentLevel === null ||
      outlook1m === null ||
      outlook2m === null ||
      outlook3m === null
    ) {
      result.quarantined.push(
        makeQuarantined("outlook_out_of_range", line, raw, "0~4 코드 아님"),
      );
      continue;
    }

    result.rows.push({
      publishedOn,
      sidoName,
      sigunName,
      sigunCode,
      currentLevel,
      outlook1m,
      outlook2m,
      outlook3m,
    });
  }

  return result;
}
