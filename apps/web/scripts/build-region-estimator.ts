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

import { stageCodeFromAvgRatio } from "../src/lib/data/drought-stage.ts";
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

/** 오름차순 정렬된 표본에서 분위수(0~1). 표본이 없으면 0. */
function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * q)),
  );
  return sortedValues[index] ?? 0;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
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

  // 일별 저수율 CSV에는 fac_code가 없어 (시설명, 소재지)로만 조인한다. 이 키가 겹치는 시설
  // (실측: 나주 방축·예천 죽안)은 어느 시설인지 확정할 수 없으므로 **양쪽 모두 제외**한다.
  // 덮어쓰면 임의의 유효저수량이 붙고, 같은 키의 일별 행이 여러 번 더해져 가중 평균이 망가진다.
  const capacityByKey = new Map<
    string,
    { sigunCode: string; capacity: number }
  >();
  const ambiguousKeys = new Set<string>();
  for (const item of reservoirs) {
    if (item.effectiveStorage === null || item.effectiveStorage <= 0) continue;
    const key = `${item.name}|${item.address}`;
    if (capacityByKey.has(key)) {
      ambiguousKeys.add(key);
      continue;
    }
    capacityByKey.set(key, {
      sigunCode: item.sigunCode,
      capacity: item.effectiveStorage,
    });
  }
  for (const key of ambiguousKeys) {
    capacityByKey.delete(key);
  }

  // 시군별 총 유효저수량(커버리지 계산용)은 조인 가능한 시설만 센다.
  const capacityBySigun = new Map<string, number>();
  for (const { sigunCode, capacity } of capacityByKey.values()) {
    capacityBySigun.set(
      sigunCode,
      (capacityBySigun.get(sigunCode) ?? 0) + capacity,
    );
  }

  // ── 공표 시군 일별(저수율·평년·평년대비).
  const droughtBytes = readFileSync(join(RAW, DROUGHT_CSV));
  const droughtRaw = decodeCp949(droughtBytes);
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
  const dailyBytes = readFileSync(join(RAW, DAILY_CSV));
  const dailyRaw = decodeUtf8(dailyBytes);
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
  // 검증 구간 통계(게이트 통과 지역만). 문서에 싣는 수치는 전부 여기서 나온다.
  const holdoutErrors: number[] = [];
  let holdoutSamples = 0;
  let stageMatches = 0;
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
    const usableRegion = trainMae <= ESTIMATOR_GATE_MAE_PP;
    regions[sigunCode] = {
      factor: Number(factor.toFixed(6)),
      trainMae: round(trainMae),
      testMae: testMae === null ? null : round(testMae),
      sampleDays: trainRows.length,
      reservoirCount: reservoirCount.get(sigunCode)?.size ?? 0,
      capacityShare: total > 0 ? round(covered / total) : 0,
      usable: usableRegion,
    };

    // 검증 구간(학습에 쓰지 않은 날짜)의 표본을 모아 문서에 싣는 통계를 산출물에서 직접 계산한다.
    // 게이트를 통과한 지역만 모아야 실제로 화면에 나갈 값의 성능이 된다.
    if (usableRegion) {
      for (const row of testRows) {
        const estimatedRatio = ((row.est * factor) / row.normal) * 100;
        holdoutErrors.push(Math.abs(estimatedRatio - row.ratio));
        holdoutSamples += 1;
        // 단계 임계값은 drought-stage.ts 단일 출처를 그대로 쓴다(여기서 복제하지 않는다).
        if (
          stageCodeFromAvgRatio(estimatedRatio) ===
          stageCodeFromAvgRatio(row.ratio)
        ) {
          stageMatches += 1;
        }
      }
    }
  }

  const usable = Object.values(regions).filter((r) => r.usable);
  // 분위수는 정렬된 표본에서만 뽑는다.
  holdoutErrors.sort((a, b) => a - b);

  const report = {
    reportVersion: "region-estimator-v1",
    generatedAt: new Date().toISOString(),
    sourceFiles: [DROUGHT_CSV, DAILY_CSV],
    // 원본 CSV "원시 바이트"를 파일별로 해시한다(적재 리포트의 sha256과 같은 방식이라 대조 가능).
    sourceChecksums: {
      [DROUGHT_CSV]: createHash("sha256").update(droughtBytes).digest("hex"),
      [DAILY_CSV]: createHash("sha256").update(dailyBytes).digest("hex"),
    },
    params: {
      trainEnd: TRAIN_END,
      gateMaePp: ESTIMATOR_GATE_MAE_PP,
      minTrainDays: MIN_TRAIN_DAYS,
    },
    summary: {
      regionCount: Object.keys(regions).length,
      usableCount: usable.length,
      ambiguousJoinKeys: ambiguousKeys.size,
      // 아래는 모두 "게이트 통과 지역 × 검증 구간" 표본에서 계산한다(문서 수치의 근거).
      holdoutSamples,
      holdoutMaePp: round(mean(holdoutErrors)),
      holdoutMedianPp: round(quantile(holdoutErrors, 0.5)),
      holdoutP90Pp: round(quantile(holdoutErrors, 0.9)),
      stageAgreementPct:
        holdoutSamples === 0
          ? 0
          : round((stageMatches / holdoutSamples) * 100, 2),
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
    `[수신호 estimator] 지역 ${report.summary.regionCount}곳 중 추정 사용 ${report.summary.usableCount}곳
` +
      `  검증(n=${report.summary.holdoutSamples}) MAE ${report.summary.holdoutMaePp}%p · ` +
      `중앙값 ${report.summary.holdoutMedianPp} · p90 ${report.summary.holdoutP90Pp} · ` +
      `단계 일치 ${report.summary.stageAgreementPct}%
` +
      `  모호 조인 제외 ${report.summary.ambiguousJoinKeys}쌍 → ${OUT}`,
  );
}

main();
