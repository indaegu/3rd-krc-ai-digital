// 백테스트 CLI — 얇은 래퍼. 순수 엔진은 src/lib/prediction/backtest.ts.
// 실행: pnpm backtest (data/raw 원CSV 필요 — gitignore 대상이므로 개발 PC 수동 명령)
// Node 24 네이티브 TS(type stripping)로 실행되므로 상대 import에 .ts 확장자가 필수다.
// .env 불필요: 네트워크·Supabase에 접근하지 않는다. runAt/gitCommit만 여기서 주입한다.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDroughtMap } from "../src/lib/data/normalize-drought-map.ts";
import {
  runBacktest,
  type BacktestPoint,
} from "../src/lib/prediction/backtest.ts";
import {
  backtestReportSchema,
  type BacktestReport,
} from "../src/lib/prediction/backtest-report.ts";

const SOURCE_FILE_NAME = "한국농어촌공사_논가뭄지도_20251231.csv";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function main(): void {
  const sourcePath = join(repoRoot, "data", "raw", SOURCE_FILE_NAME);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `원CSV가 없다: ${sourcePath} — data/raw는 gitignore 대상이므로 ` +
        `포털에서 내려받은 개발 PC에서만 실행할 수 있다`,
    );
  }

  const bytes = readFileSync(sourcePath);
  const sourceChecksum = createHash("sha256").update(bytes).digest("hex");
  const normalized = normalizeDroughtMap(bytes);

  const seriesByRegion: Record<string, BacktestPoint[]> = {};
  for (const row of normalized.rows) {
    (seriesByRegion[row.sigunCode] ??= []).push({
      observedOn: row.observedOn,
      avgRatio: row.avgRatio,
    });
  }

  const core = runBacktest(seriesByRegion);

  const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const report: BacktestReport = backtestReportSchema.parse({
    reportVersion: core.reportVersion,
    sourceFile: SOURCE_FILE_NAME,
    sourceChecksum,
    runAt: new Date().toISOString(),
    gitCommit,
    modelParams: core.modelParams,
    regionCount: core.regionCount,
    originCount: core.originCount,
    sampleCount: core.sampleCount,
    models: core.models,
    selectedModel: core.selectedModel,
    residualQuantiles: core.residualQuantiles,
    excluded: core.excluded,
  });

  const outPath = join(repoRoot, "data", "backtest-report.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const excludedByReason = new Map<string, number>();
  for (const entry of report.excluded) {
    excludedByReason.set(
      entry.reason,
      (excludedByReason.get(entry.reason) ?? 0) + 1,
    );
  }
  const excludedSummary = [...excludedByReason.entries()]
    .map(([reason, count]) => `${reason} ${formatCount(count)}`)
    .join(", ");

  console.log(`[물시계 backtest] 원천: ${SOURCE_FILE_NAME}`);
  console.log(`- SHA-256: ${sourceChecksum}`);
  console.log(
    `- 정규화: 적재 ${formatCount(normalized.rows.length)}행, 격리 ${formatCount(normalized.quarantined.length)}행`,
  );
  console.log(
    `- 지역 ${formatCount(report.regionCount)}곳 평가, 제외 ${formatCount(report.excluded.length)}곳${excludedSummary === "" ? "" : ` (${excludedSummary})`}`,
  );
  console.log(
    `- origin ${formatCount(report.originCount)}개, 표본 ${formatCount(report.sampleCount)}개`,
  );
  for (const [name, result] of Object.entries(report.models)) {
    console.log(
      `- ${name}: 7일 MAE ${result.macro.mae7.toFixed(4)} / 14일 MAE ${result.macro.mae14.toFixed(4)} (%p, macro)`,
    );
  }
  const tied =
    report.selectedModel.tiedWith.length > 0
      ? ` — 동률(≤0.05%p): ${report.selectedModel.tiedWith.join(", ")}`
      : "";
  console.log(
    `- 채택 모델: ${report.selectedModel.name} (규칙 ${report.selectedModel.rule}${tied})`,
  );
  console.log(`- 리포트: ${outPath}`);
}

try {
  main();
} catch (error: unknown) {
  console.error(
    `[물시계 backtest] 실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
