import { describe, expect, it } from "vitest";
import { QUARANTINE_REASONS, makeQuarantined } from "./quarantine";

describe("quarantine", () => {
  it("격리 사유 코드는 고정 집합이다", () => {
    expect(QUARANTINE_REASONS).toEqual([
      "placeholder_region",
      "stage_mismatch",
      "negative_rate",
      "no_spec_match",
      "ambiguous_join",
      "outlook_out_of_range",
      "invalid_value",
      "invalid_row",
    ]);
  });

  it("makeQuarantined는 detail이 없으면 키 자체를 만들지 않는다", () => {
    const q = makeQuarantined("negative_rate", 3, ["a", "b"]);
    expect(q).toEqual({ reason: "negative_rate", line: 3, raw: ["a", "b"] });
    expect("detail" in q).toBe(false);
  });

  it("makeQuarantined는 detail을 보존한다", () => {
    const q = makeQuarantined("negative_rate", 3, ["a"], "2025-01-01=-3");
    expect(q.detail).toBe("2025-01-01=-3");
  });
});
