// 전국 저수지 일별 저수율(UTF-8 BOM, wide 연간 CSV) → (facCode, observedOn, rate) long 정규화.
// 원천에 fac_code가 없어 (저수지명, 위치) ↔ 시설제원 (시설명, 소재지) 정확 일치 조인이 필수다.
import { parseCsv, parseNumericCell } from "./csv";
import { decodeUtf8 } from "./encoding";
import type { ReservoirSpec } from "./normalize-reservoir-spec";
import { makeQuarantined, type NormalizeResult } from "./quarantine";

export type DailyRateObservation = {
  facCode: string;
  observedOn: string;
  rate: number;
};

const FIXED_COLUMNS = ["저수지명", "위치", "유효저수량"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 구분자는 시설명·소재지에 나올 수 없는 NUL 문자를 쓴다.
const JOIN_SEPARATOR = String.fromCharCode(0);
const joinKey = (name: string, address: string) =>
  name + JOIN_SEPARATOR + address;

export function normalizeDailyRate(
  bytes: Uint8Array,
  specs: readonly ReservoirSpec[],
): NormalizeResult<DailyRateObservation> {
  const records = parseCsv(decodeUtf8(bytes));
  const header = records[0];
  if (
    !header ||
    header[0] !== FIXED_COLUMNS[0] ||
    header[1] !== FIXED_COLUMNS[1] ||
    header[2] !== FIXED_COLUMNS[2]
  ) {
    throw new Error(
      `일별 저수율 헤더가 예상과 다릅니다: ${header?.slice(0, 3).join(",") ?? "(없음)"}`,
    );
  }
  const dateColumns = header.slice(FIXED_COLUMNS.length);
  for (const column of dateColumns) {
    if (!DATE_PATTERN.test(column)) {
      throw new Error(`일별 저수율 날짜 열이 아닙니다: ${column}`);
    }
  }

  // 시설제원 쪽 (시설명, 소재지) 중복은 조인 불능(동명·동위치 실측 4쌍)으로 표시한다.
  const specByKey = new Map<string, ReservoirSpec | "ambiguous">();
  for (const spec of specs) {
    const key = joinKey(spec.name, spec.address ?? "");
    specByKey.set(key, specByKey.has(key) ? "ambiguous" : spec);
  }

  const result: NormalizeResult<DailyRateObservation> = {
    rows: [],
    quarantined: [],
  };
  const seenKeys = new Set<string>();

  for (let i = 1; i < records.length; i += 1) {
    const raw = records[i];
    if (!raw) continue;
    const line = i + 1;

    const name = (raw[0] ?? "").trim();
    const address = (raw[1] ?? "").trim();
    const rowLabel = [name, address];

    const key = joinKey(name, address);
    const matched = specByKey.get(key);
    if (matched === undefined) {
      result.quarantined.push(makeQuarantined("no_spec_match", line, rowLabel));
      continue;
    }
    if (matched === "ambiguous" || seenKeys.has(key)) {
      result.quarantined.push(
        makeQuarantined("ambiguous_join", line, rowLabel),
      );
      continue;
    }
    seenKeys.add(key);

    for (let d = 0; d < dateColumns.length; d += 1) {
      const observedOn = dateColumns[d];
      if (!observedOn) continue;
      const cell = raw[FIXED_COLUMNS.length + d] ?? "";
      const rate = parseNumericCell(cell);
      if (rate === null) {
        continue; // 빈 셀·비숫자는 결측 — 행을 만들지 않는다.
      }
      if (rate < 0) {
        result.quarantined.push(
          makeQuarantined(
            "negative_rate",
            line,
            rowLabel,
            `${observedOn}=${cell}`,
          ),
        );
        continue;
      }
      result.rows.push({ facCode: matched.facCode, observedOn, rate });
    }
  }

  return result;
}
