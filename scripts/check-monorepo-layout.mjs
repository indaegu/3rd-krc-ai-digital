import { access, readFile } from "node:fs/promises";

const requiredPaths = [
  "apps/web/AGENTS.md",
  "apps/web/package.json",
  "apps/web/src/app/api/v1/health/route.ts",
  "apps/android/AGENTS.md",
  "apps/android/gradlew.bat",
  "packages/contracts/AGENTS.md",
  "packages/contracts/openapi.yaml",
  "packages/llm/AGENTS.md",
  "packages/llm/src/static-coach-provider.ts",
  "infra/supabase/AGENTS.md",
  "infra/supabase/config.toml",
  "docs/llm-coach.md"
];

await Promise.all(requiredPaths.map((path) => access(path)));

const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
const webPackage = JSON.parse(await readFile("apps/web/package.json", "utf8"));
const contractsPackage = JSON.parse(
  await readFile("packages/contracts/package.json", "utf8")
);
const llmPackage = JSON.parse(await readFile("packages/llm/package.json", "utf8"));

const expectedNames = [
  rootPackage.name,
  webPackage.name,
  contractsPackage.name,
  llmPackage.name
];

if (
  JSON.stringify(expectedNames) !==
  JSON.stringify([
    "mulsigye-monorepo",
    "@mulsigye/web",
    "@mulsigye/contracts",
    "@mulsigye/llm"
  ])
) {
  throw new Error(`Unexpected workspace names: ${expectedNames.join(", ")}`);
}

console.log("Monorepo layout and workspace names are valid.");
