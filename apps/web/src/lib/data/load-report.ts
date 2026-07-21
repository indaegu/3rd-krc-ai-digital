// 적재 리포트(data/load-report.json) 스키마의 단일 출처.
// 원천 파일명·포털 갱신일(파일명 suffix YYYYMMDD)·행 수·사유별 격리 수·SHA-256·생성 시각을 담는다.
import { z } from "zod";
import { QUARANTINE_REASONS } from "./quarantine.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
const rowCount = z.number().int().nonnegative();

/** 원천 CSV 1개의 적재 결과. quarantineByReason은 8개 사유 전부를 키로 갖는다(0 포함). */
export const sourceLoadSchema = z.object({
  sourceFile: z.string().min(1),
  portalUpdatedOn: isoDate,
  sha256: sha256Hex,
  loadedRows: rowCount,
  quarantinedRows: rowCount,
  quarantineByReason: z.record(z.enum(QUARANTINE_REASONS), rowCount),
});

export const snapshotEntrySchema = z.object({
  rows: rowCount,
  sha256: sha256Hex,
});

export const loadReportSchema = z.object({
  generatedAt: z.iso.datetime(),
  mode: z.enum(["dry-run", "skip-upsert", "upsert"]),
  sources: z.object({
    droughtMap: sourceLoadSchema,
    reservoirSpec: sourceLoadSchema,
    dailyRate: sourceLoadSchema,
    outlook: sourceLoadSchema,
  }),
  snapshots: z.record(z.string(), snapshotEntrySchema),
  upsert: z.object({
    performed: z.boolean(),
    rowsByTable: z.record(z.string(), rowCount),
  }),
});

export type SourceLoad = z.infer<typeof sourceLoadSchema>;
export type SnapshotEntry = z.infer<typeof snapshotEntrySchema>;
export type LoadReport = z.infer<typeof loadReportSchema>;
