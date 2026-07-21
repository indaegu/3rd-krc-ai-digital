import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUARANTINE_REASONS,
  type QuarantineReason,
} from "../src/lib/data/quarantine";
import { normalizeDroughtMap } from "../src/lib/data/normalize-drought-map";

// data/raw는 로컬 전용(gitignore)이라 CI에서는 자동으로 건너뛴다.
const realCsvPath = resolve(
  process.cwd(),
  "../..",
  "data",
  "raw",
  "한국농어촌공사_논가뭄지도_20251231.csv",
);
const hasRealData = existsSync(realCsvPath);

describe.skipIf(!hasRealData)("논가뭄지도 실데이터 전체 정규화", () => {
  it("60,955행 전부가 rows 또는 quarantined 정확히 한 곳에 들어간다", () => {
    const bytes = new Uint8Array(readFileSync(realCsvPath));
    const result = normalizeDroughtMap(bytes);

    expect(result.rows.length + result.quarantined.length).toBe(60955);

    const known = new Set<QuarantineReason>(QUARANTINE_REASONS);
    for (const q of result.quarantined) {
      expect(known.has(q.reason)).toBe(true);
    }

    // 이 파일에서 나올 수 있는 사유만 나왔는지 확인한다(리포트 안정성).
    const seen = new Set(result.quarantined.map((q) => q.reason));
    for (const reason of seen) {
      expect([
        "placeholder_region",
        "stage_mismatch",
        "negative_rate",
        "invalid_value",
        "invalid_row",
      ]).toContain(reason);
    }
  });
});
