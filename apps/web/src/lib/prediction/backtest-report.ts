// data/backtest-report.json의 Zod 스키마 — 리포트 형태의 단일 출처.
// 엔진(backtest.ts)은 코어를 만들고, CLI(scripts/backtest.ts)가
// sourceFile/sourceChecksum/runAt/gitCommit을 주입해 이 스키마로 검증 후 기록한다.
import { z } from "zod";
import { PREDICTION_MODEL_NAMES } from "./models.ts";

/** 지역 제외 사유(프로토콜 6항). no_evaluable_origin은 평가 가능한 origin 0개 방어용. */
export const EXCLUSION_REASONS = [
  "insufficient_days",
  "long_gap",
  "no_evaluable_origin",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

const modelNameSchema = z.enum(PREDICTION_MODEL_NAMES);

/** 7일 = horizon 1~7, 14일 = horizon 1~14 잔차의 MAE/RMSE(%p, 소수 4자리 반올림). */
const metricSetSchema = z.strictObject({
  mae7: z.number(),
  rmse7: z.number(),
  mae14: z.number(),
  rmse14: z.number(),
});

const regionMetricsSchema = z.strictObject({
  originCount: z.number().int().positive(),
  mae7: z.number(),
  rmse7: z.number(),
  mae14: z.number(),
  rmse14: z.number(),
});

const modelResultSchema = z.strictObject({
  macro: metricSetSchema,
  byRegion: z.record(z.string(), regionMetricsSchema),
});

export const backtestReportSchema = z.strictObject({
  reportVersion: z.literal("backtest-v1"),
  sourceFile: z.string().min(1),
  /** 원CSV 바이트의 SHA-256(소문자 hex). */
  sourceChecksum: z.string().regex(/^[0-9a-f]{64}$/),
  runAt: z.iso.datetime(),
  gitCommit: z.string().regex(/^[0-9a-f]{40}$/),
  modelParams: z.strictObject({
    modelVersion: z.string().min(1),
    linearWindowDays: z.number().int().positive(),
    maWindowDays: z.number().int().positive(),
    sesAlpha: z.number(),
    horizonDays: z.number().int().positive(),
    minValidDays: z.number().int().positive(),
    maxGapDays: z.number().int().positive(),
    originWindowDays: z.number().int().positive(),
    originStepDays: z.number().int().positive(),
    tieBreakEpsilonPp: z.number(),
    metricDecimals: z.number().int().positive(),
  }),
  regionCount: z.number().int().nonnegative(),
  originCount: z.number().int().nonnegative(),
  sampleCount: z.number().int().nonnegative(),
  models: z.strictObject({
    naive: modelResultSchema,
    ma7: modelResultSchema,
    linear: modelResultSchema,
    ses: modelResultSchema,
  }),
  selectedModel: z.strictObject({
    name: modelNameSchema,
    /** 선택 근거: 14일 macro MAE 최저 단독 / 동률(≤ε)로 단순성 서열 적용. */
    rule: z.enum(["lowest_mae14", "simplicity_tiebreak"]),
    /** 채택 모델과 ε 이내로 동률이었던 나머지 후보(단순성 서열 순). */
    tiedWith: z.array(modelNameSchema),
    mae7: z.number(),
    rmse7: z.number(),
    mae14: z.number(),
    rmse14: z.number(),
  }),
  /** 채택 모델의 horizon 1..14 잔차(실측-예측) 경험적 분위수. */
  residualQuantiles: z
    .array(
      z.strictObject({
        horizon: z.number().int().min(1).max(14),
        count: z.number().int().nonnegative(),
        p10: z.number(),
        p90: z.number(),
      }),
    )
    .length(14),
  excluded: z.array(
    z.strictObject({
      sigunCode: z.string().min(1),
      reason: z.enum(EXCLUSION_REASONS),
    }),
  ),
});

export type BacktestReport = z.infer<typeof backtestReportSchema>;

/** 순수 엔진 출력 — CLI 주입 필드(sourceFile/체크섬/runAt/gitCommit)를 뺀 코어. */
export type BacktestCore = Omit<
  BacktestReport,
  "sourceFile" | "sourceChecksum" | "runAt" | "gitCommit"
>;
