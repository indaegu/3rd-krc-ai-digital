// 채택 모델의 백테스트 지표를 계약 예시·픽스처·문서에 한 번에 반영한다.
//
// 이 수치들은 손으로 옮겨 적힌 탓에 여러 곳에서 서로 달라졌다(리포트 1.8493인데 예시는
// 1.9168). 단일 출처는 data/backtest-report.json의 selectedModel이며, 여기서 읽어 쓴다.
//
//   node scripts/sync-model-metrics.mjs          # 파일을 고친다
//   node scripts/sync-model-metrics.mjs --check   # 다른 곳이 있으면 실패한다(CI)
//
// 소스코드 안의 단언 리터럴(Kotlin·TS)까지 고치지는 않는다. 그쪽은 픽스처가 바뀌면
// 테스트가 곧바로 실패하므로 드리프트가 조용히 남지 않는다.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const report = JSON.parse(
  readFileSync(resolve(root, "data/backtest-report.json"), "utf8"),
);
const selected = report.selectedModel;

/** 계약·픽스처의 model 블록에 실을 값. 이름·버전은 예시마다 다를 수 있어 건드리지 않는다. */
const METRICS = {
  mae7: selected.mae7,
  mae14: selected.mae14,
  mae30: selected.mae30,
};

const EXAMPLE_FILES = [
  "packages/contracts/examples/forecast.ok.json",
  "packages/contracts/examples/forecast.stable.json",
  "packages/contracts/examples/forecast.watch-demo.json",
  "packages/contracts/examples/forecast.severe-demo.json",
  "packages/contracts/examples/forecast.normal-demo.json",
  "packages/contracts/examples/forecast.flood-demo.json",
  "apps/android/app/src/test/resources/fixtures/forecast.ok.json",
  "apps/android/app/src/test/resources/fixtures/forecast.stable.json",
  "apps/android/app/src/test/resources/fixtures/forecast.watch.json",
  "apps/android/app/src/test/resources/fixtures/forecast.severe.json",
  "apps/android/app/src/test/resources/fixtures/forecast.normal.json",
  "apps/android/app/src/test/resources/fixtures/forecast.flood.json",
];

const problems = [];
const fixed = [];

/** JSON 예시의 model 블록을 리포트 값으로 맞춘다. 키 순서는 name·version 다음이다. */
function syncJson(relPath) {
  const abs = resolve(root, relPath);
  const raw = readFileSync(abs, "utf8");
  const parsed = JSON.parse(raw);
  const model = parsed.model;
  if (model === undefined) {
    problems.push(`${relPath}: model 블록이 없다`);
    return;
  }

  const stale = Object.entries(METRICS).filter(
    ([key, value]) => model[key] !== value,
  );
  if (stale.length === 0) return;

  if (check) {
    for (const [key, value] of stale) {
      problems.push(`${relPath}: ${key}=${String(model[key])} (기대 ${String(value)})`);
    }
    return;
  }

  // bandMethod 앞에 지표를 순서대로 다시 깐다 — 키 순서가 파일마다 흔들리지 않게.
  const { name, version, bandMethod, ...rest } = model;
  delete rest.mae7;
  delete rest.mae14;
  delete rest.mae30;
  parsed.model = { name, version, ...METRICS, ...rest, bandMethod };

  // 들여쓰기 2칸 + 끝 줄바꿈은 저장소의 다른 JSON과 같은 형식이다.
  writeFileSync(abs, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  fixed.push(relPath);
}

/**
 * openapi.yaml 안의 예시 블록을 맞춘다.
 *
 * 스키마 정의(`mae7: {type: number}`)는 건드리면 안 되므로, `version: pred-v1` 바로
 * 아래에 오는 예시 줄만 같은 들여쓰기로 찾아 바꾼다.
 */
function syncOpenApi() {
  const relPath = "packages/contracts/openapi.yaml";
  const abs = resolve(root, relPath);
  const original = readFileSync(abs, "utf8");
  const lines = original.split("\n");
  const next = [];
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    next.push(line);

    const versionMatch = /^(\s+)version: pred-v1\s*$/.exec(line);
    if (versionMatch === null) continue;

    const indent = versionMatch[1];
    // 뒤따르는 mae* 예시 줄을 통째로 걷어내고 리포트 값으로 다시 깐다.
    let cursor = index + 1;
    while (
      cursor < lines.length &&
      new RegExp(`^${indent}mae(7|14|30): `).test(lines[cursor])
    ) {
      cursor += 1;
    }
    const replaced = Object.entries(METRICS).map(
      ([key, value]) => `${indent}${key}: ${String(value)}`,
    );
    const existing = lines.slice(index + 1, cursor);
    if (existing.join("\n") !== replaced.join("\n")) {
      changed = true;
      if (check) {
        problems.push(`${relPath}:${String(index + 2)}: 예시 지표가 리포트와 다르다`);
      }
    }
    next.push(...replaced);
    index = cursor - 1;
  }

  if (!changed || check) return;
  writeFileSync(abs, next.join("\n"), "utf8");
  fixed.push(relPath);
}

/** 게이트 기록 문장의 수치. 문서는 사람이 읽는 근거라 틀리면 그대로 오해가 된다. */
function syncWorkPlan() {
  const relPath = "docs/work-plan.md";
  const abs = resolve(root, relPath);
  const original = readFileSync(abs, "utf8");
  // 갱신 전(MAE30 없음)과 갱신 후(MAE30 포함) 두 형태를 모두 잡는다.
  const pattern =
    /채택 모델 \S+\(MAE7 [\d.]+ \/ MAE14 [\d.]+(?: \/ MAE30 [\d.]+)? %p\)/;
  if (!pattern.test(original)) {
    problems.push(`${relPath}: 채택 모델 수치 문장을 찾지 못했다`);
    return;
  }
  const replacement = `채택 모델 ${selected.name}(MAE7 ${String(selected.mae7)} / MAE14 ${String(selected.mae14)} / MAE30 ${String(selected.mae30)} %p)`;
  const updated = original.replace(pattern, replacement);
  if (updated === original) return;
  if (check) {
    problems.push(`${relPath}: 채택 모델 수치가 리포트와 다르다`);
    return;
  }
  writeFileSync(abs, updated, "utf8");
  fixed.push(relPath);
}

for (const relPath of EXAMPLE_FILES) syncJson(relPath);
syncOpenApi();
syncWorkPlan();

if (problems.length > 0) {
  console.error("백테스트 지표가 리포트와 다릅니다:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nnode scripts/sync-model-metrics.mjs 를 실행해 맞추세요.");
  process.exit(1);
}

if (check) {
  console.log("모델 지표가 data/backtest-report.json과 일치합니다.");
} else if (fixed.length === 0) {
  console.log("고칠 것이 없습니다.");
} else {
  console.log(`갱신: ${String(fixed.length)}개 파일`);
  for (const relPath of fixed) console.log(`  - ${relPath}`);
}
