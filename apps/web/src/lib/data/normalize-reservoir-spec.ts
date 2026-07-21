// 농업기반시설 시설제원_저수지(CP949 연간 CSV) → 시설 제원 정규화.
// 시군코드 열이 없어 표준코드 앞 5자리를 유도값으로 쓴다(탑정 4423010045 → 44230 실측).
import { parseCsv, parseNumericCell } from "./csv";
import { decodeCp949 } from "./encoding";
import { makeQuarantined, type NormalizeResult } from "./quarantine";

export type ReservoirSpec = {
  facCode: string;
  name: string;
  address: string | null;
  sigunCode: string;
  beneficiaryArea: number | null;
  effectiveStorage: number | null;
};

const REQUIRED_COLUMNS = [
  "표준코드",
  "시설명",
  "소재지",
  "수혜면적",
  "유효저수량",
] as const;

const FAC_CODE_PATTERN = /^\d{10}$/;

export function normalizeReservoirSpec(
  bytes: Uint8Array,
): NormalizeResult<ReservoirSpec> {
  const records = parseCsv(decodeCp949(bytes));
  const header = records[0];
  if (!header) {
    throw new Error("시설제원 CSV가 비어 있습니다");
  }

  const columnIndex = new Map<string, number>();
  for (const column of REQUIRED_COLUMNS) {
    const index = header.indexOf(column);
    if (index < 0) {
      throw new Error(`시설제원 헤더에 ${column} 열이 없습니다`);
    }
    columnIndex.set(column, index);
  }
  const at = (
    raw: readonly string[],
    column: (typeof REQUIRED_COLUMNS)[number],
  ) => raw[columnIndex.get(column) ?? -1] ?? "";

  const result: NormalizeResult<ReservoirSpec> = { rows: [], quarantined: [] };

  for (let i = 1; i < records.length; i += 1) {
    const raw = records[i];
    if (!raw) continue;
    const line = i + 1;

    const facCode = at(raw, "표준코드").trim();
    if (!FAC_CODE_PATTERN.test(facCode)) {
      result.quarantined.push(
        makeQuarantined("invalid_value", line, raw, `표준코드 ${facCode}`),
      );
      continue;
    }
    const name = at(raw, "시설명").trim();
    if (name === "") {
      result.quarantined.push(
        makeQuarantined("invalid_value", line, raw, "시설명 결측"),
      );
      continue;
    }
    const addressCell = at(raw, "소재지").trim();

    result.rows.push({
      facCode,
      name,
      address: addressCell === "" ? null : addressCell,
      sigunCode: facCode.slice(0, 5),
      beneficiaryArea: parseNumericCell(at(raw, "수혜면적")),
      effectiveStorage: parseNumericCell(at(raw, "유효저수량")),
    });
  }

  return result;
}
