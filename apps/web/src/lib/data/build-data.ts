// KRC 공공데이터 4종 CSV → 검증·격리·(upsert)·스냅샷·리포트 파이프라인.
// scripts/build-data.ts(CLI)와 통합 테스트가 같은 함수를 재사용한다.
// Node 24 네이티브 TS(type stripping)로도 실행되므로 상대 import에 .ts 확장자가 필수다.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadReportSchema,
  type LoadReport,
  type SnapshotEntry,
  type SourceLoad,
} from "./load-report.ts";
import {
  normalizeDailyRate,
  type DailyRateObservation,
} from "./normalize-daily-rate.ts";
import {
  normalizeDroughtMap,
  type RegionalDroughtRow,
} from "./normalize-drought-map.ts";
import {
  normalizeReservoirSpec,
  type ReservoirSpec,
} from "./normalize-reservoir-spec.ts";
import {
  normalizeOutlook,
  type OfficialOutlookRow,
} from "./normalize-outlook.ts";
import {
  QUARANTINE_REASONS,
  type QuarantinedRow,
  type QuarantineReason,
} from "./quarantine.ts";
import { pickRepresentativeReservoir } from "./representative-reservoir.ts";

/** 확정 결정(2026-07-21): 대표 3개 시군 — 기장군·논산시·나주시. */
export const REPRESENTATIVE_SIGUN_CODES = ["26710", "44230", "46170"] as const;

export const SNAPSHOT_FILE_NAMES = [
  "sigun-index.json",
  "reservoirs.json",
  "regional-drought-daily.json",
  "official-outlooks.json",
  "reservoir-observations.json",
] as const;

const REGIONAL_SNAPSHOT_DAYS = 60;
const REPRESENTATIVE_SNAPSHOT_DAYS = 30;
const UPSERT_BATCH_SIZE = 1000;

export type UpsertCall = {
  table: string;
  rows: Record<string, unknown>[];
  onConflict: string;
};

/** 실제 Supabase 클라이언트와 테스트 mock이 공유하는 최소 표면. */
export type SupabaseLike = {
  from(table: string): {
    upsert(
      rows: Record<string, unknown>[],
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

export type BuildDataMode = "dry-run" | "skip-upsert" | "upsert";

export type BuildDataOptions = {
  /** 원천 CSV 4종이 있는 디렉터리(실행 시 data/raw, 테스트는 픽스처 사본). */
  rawDir: string;
  /** load-report.json과 snapshots/가 생성될 디렉터리(실행 시 data/). */
  outDir: string;
  mode: BuildDataMode;
  /** upsert 모드에서만 사용. 테스트는 mock을 주입한다. */
  supabase?: SupabaseLike;
  now?: () => Date;
};

type SourceFileRef = { fileName: string; portalUpdatedOn: string };

const SOURCE_FILE_PATTERN = /_(\d{8})\.csv$/;

function findSourceFile(rawDir: string, keyword: string): SourceFileRef {
  const candidates = readdirSync(rawDir)
    .filter((name) => name.includes(keyword) && SOURCE_FILE_PATTERN.test(name))
    .sort();
  const fileName = candidates.at(-1); // 같은 원천이 여럿이면 갱신일 suffix 최신 파일
  if (fileName === undefined) {
    throw new Error(
      `${rawDir}에서 "${keyword}" 원천 CSV(…_YYYYMMDD.csv)를 찾지 못했습니다`,
    );
  }
  const suffix = SOURCE_FILE_PATTERN.exec(fileName)?.[1] ?? "";
  return {
    fileName,
    portalUpdatedOn: `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}`,
  };
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function countByReason(
  quarantined: readonly QuarantinedRow[],
): Record<QuarantineReason, number> {
  const counts = Object.fromEntries(
    QUARANTINE_REASONS.map((reason) => [reason, 0]),
  ) as Record<QuarantineReason, number>;
  for (const row of quarantined) {
    counts[row.reason] += 1;
  }
  return counts;
}

function summarizeSource(
  ref: SourceFileRef,
  checksum: string,
  loadedRows: number,
  quarantined: readonly QuarantinedRow[],
): SourceLoad {
  return {
    sourceFile: ref.fileName,
    portalUpdatedOn: ref.portalUpdatedOn,
    sha256: checksum,
    loadedRows,
    quarantinedRows: quarantined.length,
    quarantineByReason: countByReason(quarantined),
  };
}

/** 시군코드 → 시군명·시도명(관측일 최신 행 기준). 키는 오름차순 고정(결정성). */
function buildSigunIndex(
  rows: readonly RegionalDroughtRow[],
): Record<string, { sidoName: string; sigunName: string }> {
  const latest = new Map<string, RegionalDroughtRow>();
  for (const row of rows) {
    const current = latest.get(row.sigunCode);
    if (current === undefined || row.observedOn > current.observedOn) {
      latest.set(row.sigunCode, row);
    }
  }
  const index: Record<string, { sidoName: string; sigunName: string }> = {};
  for (const code of [...latest.keys()].sort()) {
    const row = latest.get(code);
    if (row) {
      index[code] = { sidoName: row.sidoName, sigunName: row.sigunName };
    }
  }
  return index;
}

function buildReservoirsSnapshot(specs: readonly ReservoirSpec[]) {
  return [...specs]
    .sort((a, b) => (a.facCode < b.facCode ? -1 : 1))
    .map((spec) => ({
      facCode: spec.facCode,
      name: spec.name,
      address: spec.address, // 시설 소재지 — 사용자 주소가 아니므로 허용
      sigunCode: spec.sigunCode,
      beneficiaryArea: spec.beneficiaryArea,
      effectiveStorage: spec.effectiveStorage,
    }));
}

/** 전 시군 최근 N일(관측일 기준 상위 N개 달력일) 행만 남긴다. */
function buildRegionalSnapshot(rows: readonly RegionalDroughtRow[]) {
  const recentDates = new Set(
    [...new Set(rows.map((row) => row.observedOn))]
      .sort()
      .slice(-REGIONAL_SNAPSHOT_DAYS),
  );
  return rows
    .filter((row) => recentDates.has(row.observedOn))
    .sort((a, b) =>
      a.sigunCode === b.sigunCode
        ? a.observedOn < b.observedOn
          ? -1
          : 1
        : a.sigunCode < b.sigunCode
          ? -1
          : 1,
    );
}

function buildOutlookSnapshot(rows: readonly OfficialOutlookRow[]) {
  return [...rows].sort((a, b) =>
    a.publishedOn === b.publishedOn
      ? a.sigunCode < b.sigunCode
        ? -1
        : 1
      : a.publishedOn < b.publishedOn
        ? -1
        : 1,
  );
}

/** 시설별 최신 1건 + 대표 3개 시군 대표지 최근 30일. */
function buildObservationSnapshot(
  observations: readonly DailyRateObservation[],
  specs: readonly ReservoirSpec[],
) {
  const latestByFacCode = new Map<string, DailyRateObservation>();
  const byFacCode = new Map<string, DailyRateObservation[]>();
  for (const observation of observations) {
    const current = latestByFacCode.get(observation.facCode);
    if (current === undefined || observation.observedOn > current.observedOn) {
      latestByFacCode.set(observation.facCode, observation);
    }
    const series = byFacCode.get(observation.facCode);
    if (series) {
      series.push(observation);
    } else {
      byFacCode.set(observation.facCode, [observation]);
    }
  }

  const latestByFacility = [...latestByFacCode.keys()].sort().map((facCode) => {
    const observation = latestByFacCode.get(facCode);
    return {
      facCode,
      observedOn: observation?.observedOn ?? null,
      rate: observation?.rate ?? null,
      source: "daily_csv" as const,
    };
  });

  const representativeRecent30d: Record<
    string,
    {
      facCode: string;
      name: string;
      rows: { observedOn: string; rate: number }[];
    }
  > = {};
  for (const sigunCode of REPRESENTATIVE_SIGUN_CODES) {
    const representative = pickRepresentativeReservoir(sigunCode, specs);
    if (representative === null) {
      continue;
    }
    const series = (byFacCode.get(representative.facCode) ?? [])
      .slice()
      .sort((a, b) => (a.observedOn < b.observedOn ? -1 : 1))
      .slice(-REPRESENTATIVE_SNAPSHOT_DAYS)
      .map((observation) => ({
        observedOn: observation.observedOn,
        rate: observation.rate,
      }));
    representativeRecent30d[sigunCode] = {
      facCode: representative.facCode,
      name: representative.name,
      rows: series,
    };
  }

  return { latestByFacility, representativeRecent30d };
}

function toBatches<T>(rows: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    batches.push(rows.slice(start, start + size));
  }
  return batches;
}

async function upsertTable(
  client: SupabaseLike,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  for (const batch of toBatches(rows, UPSERT_BATCH_SIZE)) {
    const { error } = await client.from(table).upsert(batch, { onConflict });
    if (error !== null) {
      throw new Error(`${table} upsert 실패: ${error.message}`);
    }
  }
  return rows.length;
}

export async function runBuildData(
  options: BuildDataOptions,
): Promise<LoadReport> {
  const { rawDir, outDir, mode } = options;
  const now = options.now ?? (() => new Date());
  if (mode === "upsert" && options.supabase === undefined) {
    throw new Error("upsert 모드에는 Supabase 클라이언트가 필요합니다");
  }

  const refs = {
    droughtMap: findSourceFile(rawDir, "논가뭄지도"),
    reservoirSpec: findSourceFile(rawDir, "시설제원"),
    dailyRate: findSourceFile(rawDir, "일별 저수율"),
    outlook: findSourceFile(rawDir, "가뭄예경보"),
  };
  const bytes = {
    droughtMap: new Uint8Array(
      readFileSync(join(rawDir, refs.droughtMap.fileName)),
    ),
    reservoirSpec: new Uint8Array(
      readFileSync(join(rawDir, refs.reservoirSpec.fileName)),
    ),
    dailyRate: new Uint8Array(
      readFileSync(join(rawDir, refs.dailyRate.fileName)),
    ),
    outlook: new Uint8Array(readFileSync(join(rawDir, refs.outlook.fileName))),
  };

  // 정규화·격리 — 원천 필드명 해석은 전부 Task 3 모듈에 위임한다.
  const specResult = normalizeReservoirSpec(bytes.reservoirSpec);
  const droughtResult = normalizeDroughtMap(bytes.droughtMap);
  const dailyResult = normalizeDailyRate(bytes.dailyRate, specResult.rows);
  const outlookResult = normalizeOutlook(bytes.outlook);

  // upsert (1,000행 배치, onConflict PK). dry-run·skip-upsert는 원격을 만지지 않는다.
  const rowsByTable: Record<string, number> = {};
  if (mode === "upsert" && options.supabase !== undefined) {
    const client = options.supabase;
    rowsByTable["reservoirs"] = await upsertTable(
      client,
      "reservoirs",
      specResult.rows.map((spec) => ({
        fac_code: spec.facCode,
        name: spec.name,
        address: spec.address, // 시설 소재지(허용) — sigun_code는 generated column
        beneficiary_area: spec.beneficiaryArea,
        effective_storage: spec.effectiveStorage,
        source_file: refs.reservoirSpec.fileName,
        source_updated_on: refs.reservoirSpec.portalUpdatedOn,
      })),
      "fac_code",
    );
    rowsByTable["reservoir_observations"] = await upsertTable(
      client,
      "reservoir_observations",
      dailyResult.rows.map((observation) => ({
        fac_code: observation.facCode,
        observed_on: observation.observedOn,
        rate: observation.rate,
        water_level: null,
        source: "daily_csv",
      })),
      "fac_code,observed_on",
    );
    rowsByTable["regional_drought_daily"] = await upsertTable(
      client,
      "regional_drought_daily",
      droughtResult.rows.map((row) => ({
        sigun_code: row.sigunCode,
        observed_on: row.observedOn,
        sido_name: row.sidoName,
        sigun_name: row.sigunName,
        regional_rate: row.regionalRate,
        normal_rate: row.normalRate,
        avg_ratio: row.avgRatio,
        official_stage: row.officialStage,
      })),
      "sigun_code,observed_on",
    );
    rowsByTable["official_outlooks"] = await upsertTable(
      client,
      "official_outlooks",
      outlookResult.rows.map((row) => ({
        sigun_code: row.sigunCode,
        published_on: row.publishedOn,
        sido_name: row.sidoName,
        sigun_name: row.sigunName,
        current_level: row.currentLevel,
        outlook_1m: row.outlook1m,
        outlook_2m: row.outlook2m,
        outlook_3m: row.outlook3m,
      })),
      "sigun_code,published_on",
    );
  }

  // 스냅샷 작성 — compact JSON(용량)·정렬 고정(결정성).
  const sigunIndex = buildSigunIndex(droughtResult.rows);
  const observationSnapshot = buildObservationSnapshot(
    dailyResult.rows,
    specResult.rows,
  );
  const snapshotValues: Record<string, { rows: number; value: unknown }> = {
    "sigun-index.json": {
      rows: Object.keys(sigunIndex).length,
      value: sigunIndex,
    },
    "reservoirs.json": {
      rows: specResult.rows.length,
      value: buildReservoirsSnapshot(specResult.rows),
    },
    "regional-drought-daily.json": (() => {
      const rows = buildRegionalSnapshot(droughtResult.rows);
      return { rows: rows.length, value: rows };
    })(),
    "official-outlooks.json": (() => {
      const rows = buildOutlookSnapshot(outlookResult.rows);
      return { rows: rows.length, value: rows };
    })(),
    "reservoir-observations.json": {
      rows:
        observationSnapshot.latestByFacility.length +
        Object.values(observationSnapshot.representativeRecent30d).reduce(
          (sum, entry) => sum + entry.rows.length,
          0,
        ),
      value: observationSnapshot,
    },
  };

  const snapshotsDir = join(outDir, "snapshots");
  mkdirSync(snapshotsDir, { recursive: true });
  const snapshots: Record<string, SnapshotEntry> = {};
  for (const name of SNAPSHOT_FILE_NAMES) {
    const entry = snapshotValues[name];
    if (entry === undefined) {
      throw new Error(`스냅샷 정의 누락: ${name}`);
    }
    const serialized = `${JSON.stringify(entry.value)}\n`;
    writeFileSync(join(snapshotsDir, name), serialized, "utf8");
    snapshots[name] = { rows: entry.rows, sha256: sha256(serialized) };
  }

  const report: LoadReport = {
    generatedAt: now().toISOString(),
    mode,
    sources: {
      droughtMap: summarizeSource(
        refs.droughtMap,
        sha256(bytes.droughtMap),
        droughtResult.rows.length,
        droughtResult.quarantined,
      ),
      reservoirSpec: summarizeSource(
        refs.reservoirSpec,
        sha256(bytes.reservoirSpec),
        specResult.rows.length,
        specResult.quarantined,
      ),
      dailyRate: summarizeSource(
        refs.dailyRate,
        sha256(bytes.dailyRate),
        dailyResult.rows.length,
        dailyResult.quarantined,
      ),
      outlook: summarizeSource(
        refs.outlook,
        sha256(bytes.outlook),
        outlookResult.rows.length,
        outlookResult.quarantined,
      ),
    },
    snapshots,
    upsert: { performed: mode === "upsert", rowsByTable },
  };
  loadReportSchema.parse(report); // 스키마 자기 검증 — 리포트 드리프트 방지
  writeFileSync(
    join(outDir, "load-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return report;
}
