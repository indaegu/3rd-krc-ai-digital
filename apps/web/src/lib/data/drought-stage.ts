// 공인 가뭄단계 기준(평년 대비 70/60/50/40%)의 단일 출처.
// AGENTS.md 절대 규칙 5: 자체 위험 판정 기준을 만들지 않는다.

export type DroughtStageCode = "ok" | "watch" | "care" | "alert" | "crit";
export type DroughtStageLabel = "정상" | "관심" | "주의" | "경계" | "심각";

/** 각 단계의 '초과' 하한값(%): avgRatio가 이 값을 초과하면 해당 단계 이상이다. */
export const DROUGHT_STAGE_THRESHOLDS = {
  ok: 70,
  watch: 60,
  care: 50,
  alert: 40,
} as const;

export const STAGE_LABEL_BY_CODE: Record<DroughtStageCode, DroughtStageLabel> =
  {
    ok: "정상",
    watch: "관심",
    care: "주의",
    alert: "경계",
    crit: "심각",
  };

export const STAGE_CODE_BY_LABEL: Record<DroughtStageLabel, DroughtStageCode> =
  {
    정상: "ok",
    관심: "watch",
    주의: "care",
    경계: "alert",
    심각: "crit",
  };

/**
 * 평년 대비 저수율(%) → 단계. 70% 초과=정상, 60 초과 70 이하=관심,
 * 50 초과 60 이하=주의, 40 초과 50 이하=경계, 40 이하=심각.
 */
export function stageCodeFromAvgRatio(avgRatio: number): DroughtStageCode {
  if (avgRatio > DROUGHT_STAGE_THRESHOLDS.ok) return "ok";
  if (avgRatio > DROUGHT_STAGE_THRESHOLDS.watch) return "watch";
  if (avgRatio > DROUGHT_STAGE_THRESHOLDS.care) return "care";
  if (avgRatio > DROUGHT_STAGE_THRESHOLDS.alert) return "alert";
  return "crit";
}

export function stageCodeFromLabel(label: string): DroughtStageCode | null {
  return Object.hasOwn(STAGE_CODE_BY_LABEL, label)
    ? STAGE_CODE_BY_LABEL[label as DroughtStageLabel]
    : null;
}

/** 단계 순서(정상→심각). 게이지 눈금·stageBands 조립에 쓴다. */
export const STAGE_ORDER: readonly DroughtStageCode[] = [
  "ok",
  "watch",
  "care",
  "alert",
  "crit",
];

export interface DroughtStageBand {
  code: DroughtStageCode;
  label: DroughtStageLabel;
  /** 이 단계의 평년 대비 하한(%). ok=70 … alert=40, crit=0. */
  minRatio: number;
}

/**
 * 게이지 단계 눈금용 구간(정상→심각). 각 단계의 평년 대비 하한(minRatio)을
 * DROUGHT_STAGE_THRESHOLDS 단일 출처에서만 파생한다(심각은 하한 0). 숫자를 다시
 * 나열하지 않는다 — 임계값은 오직 이 파일에 있다(규칙 10). 서버가 이 값을 그대로
 * StatusResponse.stageBands로 내보내고, 웹·Android 게이지는 그것을 소비한다.
 */
export function droughtStageBands(): DroughtStageBand[] {
  return STAGE_ORDER.map((code) => ({
    code,
    label: STAGE_LABEL_BY_CODE[code],
    minRatio:
      code === "crit"
        ? 0
        : DROUGHT_STAGE_THRESHOLDS[
            code as keyof typeof DROUGHT_STAGE_THRESHOLDS
          ],
  }));
}

const OUTLOOK_LABELS: readonly DroughtStageLabel[] = [
  "정상",
  "관심",
  "주의",
  "경계",
  "심각",
];

/** 가뭄예경보 0~4 코드 → 한국어 라벨(포털 공식 정의: 0=정상 … 4=심각). */
export function outlookLabelFromCode(code: number): DroughtStageLabel | null {
  if (!Number.isInteger(code) || code < 0 || code > 4) {
    return null;
  }
  return OUTLOOK_LABELS[code] ?? null;
}
