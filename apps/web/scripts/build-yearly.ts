// 올해 흐름 속 현재 위치 빌더 CLI — 얇은 래퍼. 순수 엔진은 src/lib/data/yearly-position.ts.
// 실행: pnpm build:yearly (data/raw 원CSV 필요 — gitignore 대상이므로 개발 PC 수동 명령)
// Node 24 네이티브 TS(type stripping)로 실행되므로 상대 import에 .ts 확장자가 필수다.
// .env 불필요: 네트워크·Supabase에 접근하지 않는다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDroughtMap } from "../src/lib/data/normalize-drought-map.ts";
import {
  buildYearlyPosition,
  yearlyPositionSchema,
} from "../src/lib/data/yearly-position.ts";

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
  const normalized = normalizeDroughtMap(bytes);

  const seriesByRegion: Record<string, number[]> = {};
  for (const row of normalized.rows) {
    (seriesByRegion[row.sigunCode] ??= []).push(row.avgRatio);
  }

  const snapshot = yearlyPositionSchema.parse(
    buildYearlyPosition(seriesByRegion),
  );

  const outPath = join(repoRoot, "data", "yearly-position.json");
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const regionCount = Object.keys(snapshot).length;
  console.log(`[수신호 build:yearly] 원천: ${SOURCE_FILE_NAME}`);
  console.log(
    `- 정규화: 적재 ${formatCount(normalized.rows.length)}행, 격리 ${formatCount(normalized.quarantined.length)}행`,
  );
  console.log(
    `- 스냅샷: ${formatCount(regionCount)}개 지역(관측 30일 미만 제외)`,
  );
  console.log(`- 리포트: ${outPath}`);
}

try {
  main();
} catch (error: unknown) {
  console.error(
    `[수신호 build:yearly] 실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
