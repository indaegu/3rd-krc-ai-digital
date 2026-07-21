// 논가뭄지도(CP949 연간 CSV) → 시군별 일자 정규화.
// 원천 필드명 해석은 이 모듈(apps/web/src/lib/data) 밖에서 하지 않는다.
import { parseCsv, parseNumericCell } from "./csv.ts";
import { decodeCp949 } from "./encoding.ts";
import {
  stageCodeFromAvgRatio,
  stageCodeFromLabel,
  type DroughtStageLabel,
} from "./drought-stage.ts";
import { makeQuarantined, type NormalizeResult } from "./quarantine.ts";

export type RegionalDroughtRow = {
  observedOn: string;
  sidoName: string;
  sigunName: string;
  sigunCode: string;
  regionalRate: number | null;
  normalRate: number | null;
  avgRatio: number;
  officialStage: DroughtStageLabel;
};

const EXPECTED_HEADER = [
  "기준일자",
  "시도명",
  "시군명",
  "시군코드",
  "저수율(퍼센트)",
  "평년(퍼센트)",
  "평년대비(퍼센트)",
  "가뭄단계",
] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SIGUN_CODE_PATTERN = /^\d{5}$/;

export function normalizeDroughtMap(
  bytes: Uint8Array,
): NormalizeResult<RegionalDroughtRow> {
  const records = parseCsv(decodeCp949(bytes));
  const header = records[0];
  if (!header || header.join(",") !== EXPECTED_HEADER.join(",")) {
    throw new Error(
      `논가뭄지도 헤더가 예상과 다릅니다: ${header?.join(",") ?? "(없음)"}`,
    );
  }

  const result: NormalizeResult<RegionalDroughtRow> = {
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

    const [observedOn, sidoName, sigunName, sigunCode] = raw as [
      string,
      string,
      string,
      string,
    ];
    const regionalRate = parseNumericCell(raw[4] ?? "");
    const normalRate = parseNumericCell(raw[5] ?? "");
    const avgRatio = parseNumericCell(raw[6] ?? "");
    const officialStage = (raw[7] ?? "").trim();

    if (!DATE_PATTERN.test(observedOn) || !SIGUN_CODE_PATTERN.test(sigunCode)) {
      result.quarantined.push(
        makeQuarantined("invalid_value", line, raw, "기준일자·시군코드 형식"),
      );
      continue;
    }
    if (avgRatio === null) {
      result.quarantined.push(
        makeQuarantined("invalid_value", line, raw, "평년대비(퍼센트) 결측"),
      );
      continue;
    }
    const stageCode = stageCodeFromLabel(officialStage);
    if (stageCode === null) {
      result.quarantined.push(
        makeQuarantined(
          "invalid_value",
          line,
          raw,
          `가뭄단계 ${officialStage}`,
        ),
      );
      continue;
    }
    if (
      (regionalRate !== null && regionalRate < 0) ||
      (normalRate !== null && normalRate < 0) ||
      avgRatio < 0
    ) {
      result.quarantined.push(
        makeQuarantined("negative_rate", line, raw, "음수 저수율"),
      );
      continue;
    }
    // 서울·광역시 본청 등 비농업 행정구의 0/0/100 플레이스홀더 행(실측).
    if (regionalRate === 0 && normalRate === 0) {
      result.quarantined.push(makeQuarantined("placeholder_region", line, raw));
      continue;
    }
    // 원천 단계를 우선하되, 공인 임계값 계산과 다르면 격리하고 리포트에 남긴다.
    if (stageCodeFromAvgRatio(avgRatio) !== stageCode) {
      result.quarantined.push(
        makeQuarantined(
          "stage_mismatch",
          line,
          raw,
          `원천 ${officialStage}, 계산 ${stageCodeFromAvgRatio(avgRatio)}`,
        ),
      );
      continue;
    }

    result.rows.push({
      observedOn,
      sidoName,
      sigunName,
      sigunCode,
      regionalRate,
      normalRate,
      avgRatio,
      officialStage: officialStage as DroughtStageLabel,
    });
  }

  return result;
}
