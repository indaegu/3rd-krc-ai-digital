// 지역 평년 대비(avgRatio) 자체 추정 모델 산출물 생성기.
//
// 공표 자료(논가뭄지도)는 연 1회만 갱신돼 오늘 값이 없다. 이 스크립트는 저수지 단위 실측으로
// 시군 통합저수율을 다시 만들고, 공표값과 비교해 **지역별 보정계수와 사용 가능 여부(게이트)** 를
// 확정한다. 학습(1~9월)과 검증(10~12월) 구간을 나눠 과적합을 배제한다.
//
// 산출물: data/snapshots/region-estimator.json
//   - normals: 시군 → "MM-DD" → 평년 저수율(%)  (오늘 날짜의 평년값 조회용)
//   - regions: 시군 → { factor, trainMae, testMae, sampleDays, reservoirCount, capacityShare, usable }
//
// 실행: pnpm --filter @mulsigye/web build:estimator

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { decodeCp949, decodeUtf8 } from "../src/lib/data/encoding.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const RAW = join(REPO_ROOT, "data", "raw");
const OUT = join(REPO_ROOT, "data", "snapshots", "region-estimator.json");

const DROUGHT_CSV = "한국농어촌공사_논가뭄지도_20251231.csv";
const DAILY_CSV = "한국농어촌공사_전국 저수지 일별 저수율_20251231.csv";

/** 학습/검증 경계. 이 날짜까지는 보정계수 학습, 이후는 성능 검증에만 쓴다. */
const TRAIN_END = "2025-09-30";

/** 학습 구간 평년대비 MAE가 이 값을 넘으면 추정을 쓰지 않고 공표값으로 폴백한다(%p). */
export const ESTIMATOR_GATE_MAE_PP = 2.0;

/** 지역별 최소 학습 표본 일수. 이보다 적으면 판단하지 않고 폴백한다. */
const MIN_TRAIN_DAYS = 60;

interface RegionModel {
  factor: number;
  trainMae: number;
  testMae: number | null;
  sampleDays: number;
  reservoirCount: number;
  capacityShare: number;
  usable: boolean;
}

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(","));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  if (hi === undefined) return 0;
  return sorted.length % 2 === 0 && lo !== undefined ? (lo + hi) / 2 : hi;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function main(): void {
  // ── 저수지 제원(시군·유효저수량) — 이미 정규화된 스냅샷을 그대로 쓴다.
  const reservoirs = JSON.parse(
    readFileSync(
      join(REPO_ROOT, "data", "snapshots", "reservoirs.json"),
      "utf8",
    ),
  ) as {
    facCode: string;
    name: string;
    address: string;
    sigunCode: string;
    effectiveStorage: number | null;
  }[];

  const capacityByKey = new Map<
    string,
    { sigunCode: string; capacity: number }
  >();
  const capacityBySigun = new Map<string, number>();
  for (const item of reservoirs) {
    if (item.effectiveStorage === null || item.effectiveStorage <= 0) continue;
    capacityByKey.set(`${item.name}|${item.address}`, {
      sigunCode: item.sigunCode,
      capacity: item.effectiveStorage,
    });
    capacityBySigun.set(
      item.sigunCode,
      (capacityBySigun.get(item.sigunCode) ?? 0) + item.effectiveStorage,
    );
  }

  // ── 공표 시군 일별(저수율·평년·평년대비).
  const droughtRaw = decodeCp949(readFileSync(join(RAW, DROUGHT_CSV)));
  const droughtRows = parseCsv(droughtRaw).slice(1);
  const official = new Map<
    string,
    { rate: number; normal: number; ratio: number }
  >();
  const normals = new Map<string, Map<string, number>>();
  for (const row of droughtRows) {
    const [date, , , sigunCode, rateText, normalText, ratioText] = row;
    if (date === undefined || sigunCode === undefined) continue;
    const rate = Number(rateText);
    const normal = Number(normalText);
    const ratio = Number(ratioText);
    if (
      !Number.isFinite(rate) ||
      !Number.isFinite(normal) ||
      !Number.isFinite(ratio)
    )
      continue;
    // 비농업 행정구 플레이스홀더(0/0/100)는 제외한다.
    if (rate === 0 && normal === 0) continue;
    official.set(`${sigunCode}|${date}`, { rate, normal, ratio });
    if (normal > 0) {
      const monthDay = date.slice(5);
      const perRegion = normals.get(sigunCode) ?? new Map<string, number>();
      perRegion.set(monthDay, normal);
      normals.set(sigunCode, perRegion);
    }
  }

  // ── 저수지 일별 저수율(wide) → 시군·날짜별 용량가중 통합저수율.
  const dailyRaw = decodeUtf8(readFileSync(join(RAW, DAILY_CSV)));
  const dailyRows = parseCsv(dailyRaw);
  const header = dailyRows[0];
  if (header === undefined) throw new Error("일별 저수율 CSV 헤더가 없다");
  const dates = header.slice(3);

  // sigun -> date -> [가중합, 용량합]
  const acc = new Map<string, Map<string, [number, number]>>();
  const reservoirCount = new Map<string, Set<string>>();
  const coveredCapacity = new Map<string, number>();

  for (const row of dailyRows.slice(1)) {
    const name = row[0];
    const address = row[1];
    if (name === undefined || address === undefined) continue;
    const spec = capacityByKey.get(`${name}|${address}`);
    if (spec === undefined) continue;
    const { sigunCode, capacity } = spec;

    const seen = reservoirCount.get(sigunCode) ?? new Set<string>();
    if (!seen.has(`${name}|${address}`)) {
      seen.add(`${name}|${address}`);
      reservoirCount.set(sigunCode, seen);
      coveredCapacity.set(
        sigunCode,
        (coveredCapacity.get(sigunCode) ?? 0) + capacity,
      );
    }

    const byDate = acc.get(sigunCode) ?? new Map<string, [number, number]>();
    dates.forEach((date, index) => {
      const cell = row[index + 3];
      if (cell === undefined || cell === "") return;
      const rate = Number(cell);
      if (!Number.isFinite(rate)) return;
      const bucket = byDate.get(date) ?? [0, 0];
      bucket[0] += rate * capacity;
      bucket[1] += capacity;
      byDate.set(date, bucket);
    });
    acc.set(sigunCode, byDate);
  }

  // ── 지역별 보정계수 + 게이트.
  const regions: Record<string, RegionModel> = {};
  for (const [sigunCode, byDate] of acc) {
    const trainRows: {
      est: number;
      rate: number;
      normal: number;
      ratio: number;
    }[] = [];
    const testRows: typeof trainRows = [];
    for (const [date, [weighted, capacity]] of byDate) {
      if (capacity <= 0) continue;
      const record = official.get(`${sigunCode}|${date}`);
      if (record === undefined || record.normal <= 0) continue;
      const est = weighted / capacity;
      if (est <= 0) continue;
      (date <= TRAIN_END ? trainRows : testRows).push({
        est,
        rate: record.rate,
        normal: record.normal,
        ratio: record.ratio,
      });
    }
    if (trainRows.length < MIN_TRAIN_DAYS) continue;

    // 보정계수는 "공표 저수율 / 원시 추정"의 중앙값. 보정이 오히려 나쁘면 1.0을 쓴다.
    const factorCandidate = median(trainRows.map((r) => r.rate / r.est));
    const maeWith = (k: number, rows: typeof trainRows) =>
      mean(rows.map((r) => Math.abs(((r.est * k) / r.normal) * 100 - r.ratio)));
    const rawMae = maeWith(1, trainRows);
    const calMae = maeWith(factorCandidate, trainRows);
    const factor = rawMae <= calMae ? 1 : factorCandidate;
    const trainMae = Math.min(rawMae, calMae);
    const testMae = testRows.length > 0 ? maeWith(factor, testRows) : null;

    const total = capacityBySigun.get(sigunCode) ?? 0;
    const covered = coveredCapacity.get(sigunCode) ?? 0;
    regions[sigunCode] = {
      factor: Number(factor.toFixed(6)),
      trainMae: Number(trainMae.toFixed(4)),
      testMae: testMae === null ? null : Number(testMae.toFixed(4)),
      sampleDays: trainRows.length,
      reservoirCount: reservoirCount.get(sigunCode)?.size ?? 0,
      capacityShare: total > 0 ? Number((covered / total).toFixed(4)) : 0,
      usable: trainMae <= ESTIMATOR_GATE_MAE_PP,
    };
  }

  const usable = Object.values(regions).filter((r) => r.usable);
  const testErrors = usable
    .map((r) => r.testMae)
    .filter((v): v is number => v !== null);

  const report = {
    reportVersion: "region-estimator-v1",
    generatedAt: new Date().toISOString(),
    sourceFiles: [DROUGHT_CSV, DAILY_CSV],
    sourceChecksum: createHash("sha256").update(droughtRaw).digest("hex"),
    params: {
      trainEnd: TRAIN_END,
      gateMaePp: ESTIMATOR_GATE_MAE_PP,
      minTrainDays: MIN_TRAIN_DAYS,
    },
    summary: {
      regionCount: Object.keys(regions).length,
      usableCount: usable.length,
      holdoutMaePp: Number(mean(testErrors).toFixed(4)),
    },
    normals: Object.fromEntries(
      [...normals].map(([code, byMonthDay]) => [
        code,
        Object.fromEntries(byMonthDay),
      ]),
    ),
    regions,
  };

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `[수신호 estimator] 지역 ${report.summary.regionCount}곳 중 추정 사용 ${report.summary.usableCount}곳 · ` +
      `검증 MAE ${report.summary.holdoutMaePp}%p → ${OUT}`,
  );
}

main();
