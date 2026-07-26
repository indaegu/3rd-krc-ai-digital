// 지역 평년 대비 추정 산출물 게이트 — 커밋된 data/snapshots/region-estimator.json이
// ① 형태·불변식을 지키고 ② docs/data-sources.md에 적힌 검증 수치와 일치하는지 확인한다.
//
// 산출물 재생성(`pnpm build:estimator`)은 `data/raw` 원CSV가 필요해 CI에서 돌릴 수 없다
// (backtest와 같은 제약). 그래서 CI에서는 **커밋된 산출물과 문서가 어긋나지 않는지**를 막고,
// 원CSV로부터의 재현은 개발 PC의 `pnpm build:estimator`가 담당한다
// (docs/testing-and-feedback.md 검증 표와 동일한 분업).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import estimatorJson from "../../../data/snapshots/region-estimator.json" with { type: "json" };

const regionModelSchema = z.object({
  factor: z.number().positive(),
  trainMae: z.number().min(0),
  validMae: z.number().min(0),
  testMae: z.number().min(0).nullable(),
  sampleDays: z.number().int().positive(),
  validDays: z.number().int().positive(),
  reservoirCount: z.number().int().nonnegative(),
  capacityShare: z.number().min(0).max(1),
  usable: z.boolean(),
});

const estimatorSchema = z.object({
  reportVersion: z.literal("region-estimator-v1"),
  generatedAt: z.string().min(1),
  sourceFiles: z.array(z.string().min(1)).min(2),
  // 원본 CSV별 원시 바이트 sha256 — 적재 리포트와 대조할 수 있어야 한다.
  sourceChecksums: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  params: z.object({
    trainEnd: z.string().min(1),
    validEnd: z.string().min(1),
    gateMaePp: z.number().positive(),
    minTrainDays: z.number().int().positive(),
    minValidDays: z.number().int().positive(),
  }),
  summary: z.object({
    regionCount: z.number().int().positive(),
    usableCount: z.number().int().positive(),
    ambiguousJoinKeys: z.number().int().nonnegative(),
    holdoutSamples: z.number().int().positive(),
    holdoutMaePp: z.number().min(0),
    holdoutMedianPp: z.number().min(0),
    holdoutP90Pp: z.number().min(0),
    stageAgreementPct: z.number().min(0).max(100),
  }),
  normals: z.record(z.string(), z.record(z.string(), z.number().min(0))),
  regions: z.record(z.string(), regionModelSchema),
});

const report = estimatorSchema.parse(estimatorJson);

function readDoc(): string {
  return readFileSync(
    join(process.cwd(), "..", "..", "docs", "data-sources.md"),
    "utf8",
  );
}

describe("지역 추정 산출물 — 형태·불변식", () => {
  it("커밋된 region-estimator.json이 스키마를 통과한다", () => {
    expect(report.regions).toBeDefined();
  });

  it("모든 원본 파일의 체크섬이 기록돼 있다", () => {
    for (const file of report.sourceFiles) {
      expect(report.sourceChecksums[file]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("usable 지역은 검증 MAE가 게이트 이하다(폴백 규칙 불변식)", () => {
    for (const [code, model] of Object.entries(report.regions)) {
      expect(
        model.usable,
        `${code}: validMae ${String(model.validMae)} vs gate ${String(report.params.gateMaePp)}`,
      ).toBe(model.validMae <= report.params.gateMaePp);
    }
  });

  it("구간이 학습 → 검증 → 시험 순으로 겹치지 않게 나뉘어 있다", () => {
    // 게이트는 학습에 쓰지 않은 구간에서, 보고 수치는 게이트 판정에도 쓰지 않은 구간에서 나온다.
    expect(report.params.trainEnd < report.params.validEnd).toBe(true);
    for (const [code, model] of Object.entries(report.regions)) {
      expect(model.sampleDays, code).toBeGreaterThanOrEqual(
        report.params.minTrainDays,
      );
      expect(model.validDays, code).toBeGreaterThanOrEqual(
        report.params.minValidDays,
      );
    }
  });

  it("요약의 usableCount가 실제 usable 지역 수와 같다", () => {
    const actual = Object.values(report.regions).filter((r) => r.usable).length;
    expect(report.summary.usableCount).toBe(actual);
    expect(report.summary.regionCount).toBe(Object.keys(report.regions).length);
  });

  it("분위수 순서가 뒤집히지 않는다(중앙값 ≤ p90)", () => {
    expect(report.summary.holdoutMedianPp).toBeLessThanOrEqual(
      report.summary.holdoutP90Pp,
    );
  });

  it("평년 곡선은 시군별로 하루 단위 값을 갖는다", () => {
    const first = Object.values(report.normals)[0];
    expect(first).toBeDefined();
    expect(Object.keys(first ?? {}).length).toBeGreaterThan(300);
  });
});

describe("지역 추정 산출물 — 문서 드리프트 가드", () => {
  const doc = readDoc();

  it("docs/data-sources.md의 검증 수치가 산출물 값과 일치한다", () => {
    const { summary } = report;
    expect(doc).toContain(`${String(summary.usableCount)}곳`);
    expect(doc).toContain(`${summary.holdoutMaePp.toFixed(2)}%p`);
    expect(doc).toContain(summary.holdoutMedianPp.toFixed(2));
    expect(doc).toContain(summary.holdoutP90Pp.toFixed(2));
    expect(doc).toContain(`${summary.stageAgreementPct.toFixed(1)}%`);
  });

  it("게이트 임계값이 문서와 같다", () => {
    expect(doc).toContain(`${report.params.gateMaePp.toFixed(1)}%p`);
  });
});
