// KRC 공공데이터 적재 CLI — 얇은 래퍼. 파이프라인 본체는 src/lib/data/build-data.ts.
// 실행: pnpm build:data [-- --dry-run | --skip-upsert]
// Node 24 네이티브 TS(type stripping)로 실행되므로 상대 import에 .ts 확장자가 필수다.
// dotenv 없이 저장소 루트 .env.local을 직접 파싱한다(새 의존성 금지).
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runBuildData,
  SNAPSHOT_FILE_NAMES,
  type BuildDataMode,
  type BuildDataOptions,
} from "../src/lib/data/build-data.ts";
import { createServiceRoleClient } from "../src/lib/data/supabase-server.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");

function parseMode(rawArgs: readonly string[]): BuildDataMode {
  // pnpm이 중첩 스크립트로 전달하는 구분자 "--"는 인자가 아니다.
  const args = rawArgs.filter((arg) => arg !== "--");
  const unknown = args.filter(
    (arg) => arg !== "--dry-run" && arg !== "--skip-upsert",
  );
  if (unknown.length > 0) {
    throw new Error(
      `알 수 없는 인자: ${unknown.join(" ")} (허용: --dry-run, --skip-upsert)`,
    );
  }
  if (args.includes("--dry-run")) return "dry-run";
  if (args.includes("--skip-upsert")) return "skip-upsert";
  return "upsert";
}

/** 루트 .env.local의 KEY=VALUE 줄을 파싱한다(따옴표 감싸기 허용, # 주석 무시). */
function loadEnvLocal(): Record<string, string> {
  const envPath = join(repoRoot, ".env.local");
  if (!existsSync(envPath)) {
    return {};
  }
  const parsed: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const outDir = join(repoRoot, "data");
  const options: BuildDataOptions = {
    rawDir: join(repoRoot, "data", "raw"),
    outDir,
    mode,
  };
  if (mode === "upsert") {
    const envFile = loadEnvLocal();
    options.supabase = createServiceRoleClient({
      SUPABASE_URL: process.env["SUPABASE_URL"] ?? envFile["SUPABASE_URL"],
      SUPABASE_SECRET_KEY:
        process.env["SUPABASE_SECRET_KEY"] ?? envFile["SUPABASE_SECRET_KEY"],
    });
  }

  const report = await runBuildData(options);

  console.log(`[물시계 build:data] 모드: ${mode}`);
  for (const [key, source] of Object.entries(report.sources)) {
    const reasons = Object.entries(source.quarantineByReason)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${reason} ${formatCount(count)}`)
      .join(", ");
    console.log(
      `- ${key}: ${source.sourceFile} (포털 갱신일 ${source.portalUpdatedOn})`,
    );
    console.log(
      `  적재 ${formatCount(source.loadedRows)}행, 격리 ${formatCount(source.quarantinedRows)}행${reasons === "" ? "" : ` (${reasons})`}`,
    );
  }
  if (report.upsert.performed) {
    for (const [table, count] of Object.entries(report.upsert.rowsByTable)) {
      console.log(`- upsert ${table}: ${formatCount(count)}행`);
    }
  } else {
    console.log("- upsert: 건너뜀 (원격 미접속)");
  }
  for (const name of SNAPSHOT_FILE_NAMES) {
    const entry = report.snapshots[name];
    const size = statSync(join(outDir, "snapshots", name)).size;
    console.log(
      `- 스냅샷 ${name}: ${formatCount(entry?.rows ?? 0)}행, ${formatCount(size)} bytes`,
    );
  }
  console.log(`- 리포트: ${join(outDir, "load-report.json")}`);
}

main().catch((error: unknown) => {
  console.error(
    `[물시계 build:data] 실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
