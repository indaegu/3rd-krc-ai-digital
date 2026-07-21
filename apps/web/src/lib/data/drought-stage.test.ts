import { describe, expect, it } from "vitest";
import {
  DROUGHT_STAGE_THRESHOLDS,
  STAGE_CODE_BY_LABEL,
  STAGE_LABEL_BY_CODE,
  outlookLabelFromCode,
  stageCodeFromAvgRatio,
  stageCodeFromLabel,
} from "./drought-stage";

describe("DROUGHT_STAGE_THRESHOLDS", () => {
  it("공인 임계값 70/60/50/40만 사용한다", () => {
    expect(DROUGHT_STAGE_THRESHOLDS).toEqual({
      ok: 70,
      watch: 60,
      care: 50,
      alert: 40,
    });
  });
});

describe("stageCodeFromAvgRatio (70 초과=정상, 이하 경계 포함)", () => {
  it.each([
    [100, "ok"],
    [70.1, "ok"],
    [70, "watch"], // 70% 이하는 관심
    [60.1, "watch"],
    [60, "care"], // 60% 이하는 주의
    [50.1, "care"],
    [50, "alert"], // 50% 이하는 경계
    [40.1, "alert"],
    [40, "crit"], // 40% 이하는 심각
    [0, "crit"],
    [140.1, "ok"], // 100 초과 실측값 보존
  ])("avgRatio %s → %s", (avgRatio, code) => {
    expect(stageCodeFromAvgRatio(avgRatio)).toBe(code);
  });
});

describe("한국어 단계명 ↔ UI 토큰 매핑", () => {
  it("code → label", () => {
    expect(STAGE_LABEL_BY_CODE).toEqual({
      ok: "정상",
      watch: "관심",
      care: "주의",
      alert: "경계",
      crit: "심각",
    });
  });

  it("label → code", () => {
    expect(STAGE_CODE_BY_LABEL["정상"]).toBe("ok");
    expect(STAGE_CODE_BY_LABEL["관심"]).toBe("watch");
    expect(STAGE_CODE_BY_LABEL["주의"]).toBe("care");
    expect(STAGE_CODE_BY_LABEL["경계"]).toBe("alert");
    expect(STAGE_CODE_BY_LABEL["심각"]).toBe("crit");
  });

  it("모르는 라벨은 null", () => {
    expect(stageCodeFromLabel("정상")).toBe("ok");
    expect(stageCodeFromLabel("이상함")).toBeNull();
    expect(stageCodeFromLabel("")).toBeNull();
  });
});

describe("outlookLabelFromCode (예경보 0~4 코드)", () => {
  it.each([
    [0, "정상"],
    [1, "관심"],
    [2, "주의"],
    [3, "경계"],
    [4, "심각"],
  ])("%s → %s", (code, label) => {
    expect(outlookLabelFromCode(code)).toBe(label);
  });

  it("범위 밖·비정수는 null", () => {
    expect(outlookLabelFromCode(5)).toBeNull();
    expect(outlookLabelFromCode(-1)).toBeNull();
    expect(outlookLabelFromCode(1.5)).toBeNull();
    expect(outlookLabelFromCode(Number.NaN)).toBeNull();
  });
});
