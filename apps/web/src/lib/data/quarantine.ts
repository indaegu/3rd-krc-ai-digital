// 격리 사유 코드와 정규화 결과 타입. 적재 리포트가 이 집합만 사용하도록 한 곳에 고정한다.
export const QUARANTINE_REASONS = [
  "placeholder_region",
  "stage_mismatch",
  "negative_rate",
  "no_spec_match",
  "ambiguous_join",
  "outlook_out_of_range",
  "invalid_value",
  "invalid_row",
] as const;

export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];

export type QuarantinedRow = {
  reason: QuarantineReason;
  /** 원본 파일 기준 1-based 줄 번호(헤더 = 1줄). */
  line: number;
  raw: readonly string[];
  detail?: string;
};

export type NormalizeResult<T> = {
  rows: T[];
  quarantined: QuarantinedRow[];
};

export function makeQuarantined(
  reason: QuarantineReason,
  line: number,
  raw: readonly string[],
  detail?: string,
): QuarantinedRow {
  // exactOptionalPropertyTypes 아래에서 detail 키 자체를 만들지 않기 위한 분기.
  return detail === undefined
    ? { reason, line, raw }
    : { reason, line, raw, detail };
}
