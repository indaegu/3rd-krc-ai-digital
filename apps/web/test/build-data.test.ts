// 적재 CLI(build-data) 통합 테스트 — 픽스처 디렉터리 대상 dry-run.
// 실데이터(data/raw)가 아니라 test/fixtures 사본으로 검증한다(CI에서도 항상 실행).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  runBuildData,
  SNAPSHOT_FILE_NAMES,
  type SupabaseLike,
  type UpsertCall,
} from "../src/lib/data/build-data";
import { loadReportSchema } from "../src/lib/data/load-report";
import { QUARANTINE_REASONS } from "../src/lib/data/quarantine";

const FIXTURES_DIR = resolve(process.cwd(), "test", "fixtures");

// 사용자 주소 원문 관련 키는 upsert payload 어디에도 나타나면 안 된다.
// 시설 소재지(address)는 사용자 주소가 아니므로 허용한다.
const FORBIDDEN_PAYLOAD_KEYS = [
  "roadAddr",
  "jibunAddr",
  "label",
  "admCd",
  "bdMgtSn",
  "zipNo",
  "userAddress",
];

const tempDirs: string[] = [];
let rawDir: string;

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makeMockSupabase(): { client: SupabaseLike; calls: UpsertCall[] } {
  const calls: UpsertCall[] = [];
  const client: SupabaseLike = {
    from(table) {
      return {
        upsert: (rows, options) => {
          calls.push({ table, rows, onConflict: options.onConflict });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, calls };
}

beforeAll(() => {
  // 픽스처를 실데이터 파일명 규칙(…_YYYYMMDD.csv)으로 복사해 입력 디렉터리를 만든다.
  rawDir = makeTempDir("mulsigye-raw-");
  copyFileSync(
    join(FIXTURES_DIR, "drought-map.head.csv"),
    join(rawDir, "한국농어촌공사_논가뭄지도_20251231.csv"),
  );
  copyFileSync(
    join(FIXTURES_DIR, "reservoir-spec.head.csv"),
    join(rawDir, "한국농어촌공사_농업기반시설 시설제원_저수지_20250925.csv"),
  );
  copyFileSync(
    join(FIXTURES_DIR, "daily-rate.head.csv"),
    join(rawDir, "한국농어촌공사_전국 저수지 일별 저수율_20251231.csv"),
  );
  copyFileSync(
    join(FIXTURES_DIR, "outlook.head.csv"),
    join(rawDir, "한국농어촌공사_가뭄예경보자료_20251201.csv"),
  );
});

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("build-data dry-run 통합", () => {
  it("리포트가 Zod 스키마에 맞고 체크섬·사유별 격리 카운트를 담는다", async () => {
    const outDir = makeTempDir("mulsigye-out-");
    await runBuildData({ rawDir, outDir, mode: "dry-run" });

    const reportPath = join(outDir, "load-report.json");
    expect(existsSync(reportPath)).toBe(true);

    const report = loadReportSchema.parse(
      JSON.parse(readFileSync(reportPath, "utf8")),
    );
    expect(report.mode).toBe("dry-run");
    expect(report.upsert.performed).toBe(false);

    // 파일명 suffix(YYYYMMDD)에서 유도한 포털 갱신일.
    expect(report.sources.droughtMap.portalUpdatedOn).toBe("2025-12-31");
    expect(report.sources.reservoirSpec.portalUpdatedOn).toBe("2025-09-25");
    expect(report.sources.dailyRate.portalUpdatedOn).toBe("2025-12-31");
    expect(report.sources.outlook.portalUpdatedOn).toBe("2025-12-01");

    for (const source of Object.values(report.sources)) {
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      // 사유별 카운트는 8개 사유 전부를 키로 갖는다(0 포함).
      expect(Object.keys(source.quarantineByReason).sort()).toEqual(
        [...QUARANTINE_REASONS].sort(),
      );
      const total = Object.values(source.quarantineByReason).reduce(
        (a, b) => a + b,
        0,
      );
      expect(total).toBe(source.quarantinedRows);
    }

    // 픽스처 head에는 서울 등 0/0 플레이스홀더 행이 존재한다.
    expect(
      report.sources.droughtMap.quarantineByReason.placeholder_region,
    ).toBeGreaterThan(0);
    expect(report.sources.droughtMap.loadedRows).toBeGreaterThan(0);
    expect(report.sources.reservoirSpec.loadedRows).toBeGreaterThan(0);
    expect(report.sources.dailyRate.loadedRows).toBeGreaterThan(0);
    expect(report.sources.outlook.loadedRows).toBeGreaterThan(0);
  });

  it("스냅샷 5종을 생성한다", async () => {
    const outDir = makeTempDir("mulsigye-out-");
    const report = await runBuildData({ rawDir, outDir, mode: "dry-run" });

    expect(SNAPSHOT_FILE_NAMES).toEqual([
      "sigun-index.json",
      "reservoirs.json",
      "regional-drought-daily.json",
      "official-outlooks.json",
      "reservoir-observations.json",
    ]);
    for (const name of SNAPSHOT_FILE_NAMES) {
      const path = join(outDir, "snapshots", name);
      expect(existsSync(path)).toBe(true);
      expect(() => JSON.parse(readFileSync(path, "utf8"))).not.toThrow();
      expect(report.snapshots[name]).toBeDefined();
    }

    const sigunIndex = JSON.parse(
      readFileSync(join(outDir, "snapshots", "sigun-index.json"), "utf8"),
    ) as Record<string, { sidoName: string; sigunName: string }>;
    expect(sigunIndex["26710"]).toEqual({
      sidoName: "부산",
      sigunName: "기장군",
    });
    // 플레이스홀더로 격리된 비농업 행정구(서울 11000)는 인덱스에 없다.
    expect(sigunIndex["11000"]).toBeUndefined();

    const reservoirs = JSON.parse(
      readFileSync(join(outDir, "snapshots", "reservoirs.json"), "utf8"),
    ) as { facCode: string }[];
    expect(reservoirs.length).toBe(report.sources.reservoirSpec.loadedRows);
  });

  it("dry-run은 주입된 Supabase 클라이언트를 호출하지 않는다", async () => {
    const outDir = makeTempDir("mulsigye-out-");
    const { client, calls } = makeMockSupabase();
    await runBuildData({ rawDir, outDir, mode: "dry-run", supabase: client });
    expect(calls.length).toBe(0);
  });

  it("upsert payload에 사용자 주소 원문 키가 없고 1,000행 배치·PK onConflict를 지킨다", async () => {
    const outDir = makeTempDir("mulsigye-out-");
    const { client, calls } = makeMockSupabase();
    const report = await runBuildData({
      rawDir,
      outDir,
      mode: "upsert",
      supabase: client,
    });

    expect(report.upsert.performed).toBe(true);
    const tables = new Set(calls.map((call) => call.table));
    expect(tables).toEqual(
      new Set([
        "reservoirs",
        "reservoir_observations",
        "regional_drought_daily",
        "official_outlooks",
      ]),
    );

    const expectedConflict: Record<string, string> = {
      reservoirs: "fac_code",
      reservoir_observations: "fac_code,observed_on",
      regional_drought_daily: "sigun_code,observed_on",
      official_outlooks: "sigun_code,published_on",
    };
    for (const call of calls) {
      expect(call.rows.length).toBeGreaterThan(0);
      expect(call.rows.length).toBeLessThanOrEqual(1000);
      expect(call.onConflict).toBe(expectedConflict[call.table]);
      for (const row of call.rows) {
        for (const key of FORBIDDEN_PAYLOAD_KEYS) {
          expect(Object.keys(row)).not.toContain(key);
        }
      }
    }

    // 시군코드는 generated column이므로 payload에 넣지 않는다.
    const reservoirRows = calls
      .filter((call) => call.table === "reservoirs")
      .flatMap((call) => call.rows);
    expect(reservoirRows.length).toBe(report.sources.reservoirSpec.loadedRows);
    for (const row of reservoirRows) {
      expect(Object.keys(row)).not.toContain("sigun_code");
    }

    const upsertedByTable = new Map<string, number>();
    for (const call of calls) {
      upsertedByTable.set(
        call.table,
        (upsertedByTable.get(call.table) ?? 0) + call.rows.length,
      );
    }
    expect(report.upsert.rowsByTable).toEqual(
      Object.fromEntries(upsertedByTable),
    );
  });

  it("같은 입력이면 리포트 체크섬과 스냅샷 체크섬이 동일하다(결정성)", async () => {
    const outDirA = makeTempDir("mulsigye-out-a-");
    const outDirB = makeTempDir("mulsigye-out-b-");
    const first = await runBuildData({
      rawDir,
      outDir: outDirA,
      mode: "dry-run",
    });
    const second = await runBuildData({
      rawDir,
      outDir: outDirB,
      mode: "dry-run",
    });

    expect(second.sources).toEqual(first.sources);
    expect(second.snapshots).toEqual(first.snapshots);
    for (const name of SNAPSHOT_FILE_NAMES) {
      const a = readFileSync(join(outDirA, "snapshots", name), "utf8");
      const b = readFileSync(join(outDirB, "snapshots", name), "utf8");
      expect(b).toBe(a);
    }
  });

  it("스냅샷 출력 디렉터리가 없으면 만든다", async () => {
    const outDir = join(makeTempDir("mulsigye-out-"), "nested", "data");
    mkdirSync(join(outDir, ".."), { recursive: true });
    await runBuildData({ rawDir, outDir, mode: "skip-upsert" });
    expect(existsSync(join(outDir, "load-report.json"))).toBe(true);
  });
});
