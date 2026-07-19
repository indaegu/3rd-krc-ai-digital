# Mulsigye Monorepo Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AGENTS.md`가 있는 저장소 루트를 기준으로 Next.js 웹, Kotlin Android, OpenAPI 계약, LLM 서버 패키지, Supabase 인프라가 분리된 모노레포를 만들고 `/api/v1/health`를 웹과 Android가 함께 소비하는 첫 세로 조각을 완성한다.

**Architecture:** pnpm workspace는 `apps/web`과 `packages/*`만 관리하고, Android와 Supabase는 각각 Gradle Wrapper와 Supabase CLI로 독립 관리한다. 의존 방향은 `packages/contracts` → `packages/llm` → `apps/web`이며 Android는 코드를 공유하지 않고 HTTPS/OpenAPI 계약만 소비한다. Vercel은 `apps/web`을 Root Directory로 배포하고, Anthropic 추론은 `packages/llm`의 서버 전용 경계 뒤에 두되 실데이터·캐시·예산 가드가 없는 공개 코치 경로는 만들지 않는다.

**Tech Stack:** Node.js 24.x, pnpm 10.33.0, Next.js 16.2.10, React 19.2.7, TypeScript 7.0.2, Vitest 4.1.10, OpenAPI 3.1/Redocly 2.39.0, Zod 4.4.3, Anthropic SDK 0.112.3, Supabase CLI 2.109.1, JDK 17, Gradle 8.13, AGP 8.13.2, Kotlin 2.3.21, Compose BOM 2026.06.00.

## Global Constraints

- 제출 마감은 2026-07-31이고 서비스 URL은 2026-09-10 발표심사까지 유지한다.
- 회원가입, 로그인, Supabase Auth, 알림, 자유 채팅, 자유 프롬프트, WebView, JavaScript 브릿지는 구현하지 않는다.
- 웹·Android는 KRC, Supabase, Anthropic을 직접 호출하지 않고 Vercel의 `/api/v1/*`만 호출한다.
- `packages/contracts/openapi.yaml`이 HTTP 계약의 SSOT이며 호환성을 깨는 변경은 `/api/v2`로 낸다.
- 공인 가뭄 단계는 평년 대비 70/60/50/40% 기준만 사용하고 클라이언트에서 다시 계산하지 않는다.
- 예측 문구는 참고 표현만 사용하며 `~됩니다`, `위험합니다`처럼 단정하지 않는다.
- Claude 모델 ID는 `claude-opus-4-7`, timeout은 4,000ms, max tokens는 256, 공모전 API 비용 상한은 USD 5, KST 일일 live miss 한도는 20회다.
- Claude Max OAuth 자격증명은 로컬 Claude Code·수동 평가·사전 생성에만 사용하고 Vercel 런타임에는 `ANTHROPIC_API_KEY`만 사용한다.
- LLM은 단계·수치·예측·행동 ID·행동 순서를 만들거나 바꾸지 않고 서버가 확정한 사실과 행동의 쉬운 설명만 생성한다.
- LLM 비활성, 키 없음, 캐시·예산·공급자 장애는 사용자 요청 실패가 아니며 검토 완료 정적 코치로 폴백한다.
- Android는 `minSdk 26`, `compileSdk 36`, `targetSdk 36`, 네임스페이스와 application ID는 `com.mulsigye.app`으로 고정한다.
- CSS 프레임워크, CSS-in-JS, 차트 라이브러리, 전역 상태 라이브러리, Hilt, Navigation, DataStore는 이번 부트스트랩에 추가하지 않는다.
- Turborepo를 추가하지 않는다. 루트 pnpm scripts, Gradle Wrapper, Supabase CLI로만 오케스트레이션한다.
- 코드·경로·의존성·명령 변경은 관련 SSOT 문서와 같은 커밋에 포함한다.
- 사용자 별도 지시가 없으므로 작업 브랜치에서 검증·커밋·푸시하고 기존 `main` 대상 PR을 갱신한다. `main` 직접 푸시는 하지 않는다.

---

## Locked Repository Layout

```text
/
├─ apps/
│  ├─ web/                     # Next.js UI + Vercel Route Handlers
│  └─ android/                 # Kotlin/Jetpack Compose, independent Gradle build
├─ packages/
│  ├─ contracts/               # OpenAPI 3.1 + generated TypeScript types + fixtures
│  └─ llm/                     # server-only provider boundary, policy validation, static fallback
├─ infra/
│  └─ supabase/                # config, append-only migrations, pgTAP tests
├─ data/                       # validated public-data and evaluation artifacts
├─ docs/                       # product/architecture/operations SSOT
├─ prototype/                  # visual reference, never domain SSOT
├─ scripts/                    # cross-workspace verification and data CLI
├─ package.json
├─ pnpm-workspace.yaml
├─ pnpm-lock.yaml
└─ AGENTS.md
```

The initial slice exposes this contract:

```ts
export type HealthResponse = {
  schemaVersion: "1";
  service: "mulsigye-api";
  status: "ok";
  asOf: string;
  sources: string[];
  stale: boolean;
};

export type ApiError = {
  code: string;
  message: string;
  retryable: boolean;
};
```

The initial LLM boundary exposes these contracts without a public route:

```ts
export interface CoachProvider {
  generate(facts: CoachFactPacket): Promise<GeneratedCoachCopy>;
}

export interface CoachFactPacket {
  factSchemaVersion: "1";
  officialStage: "정상" | "관심" | "주의" | "경계" | "심각";
  season: "봄" | "여름" | "가을" | "겨울";
  reachBucket: "none" | "within_7d" | "within_14d" | "within_30d";
  trendBucket: "rising" | "stable" | "falling";
  highWaterNotice: boolean;
  officialOutlookCode: ApprovedOutlookCode | null;
  actions: Array<{
    id: string;
    approvedTitle: string;
    approvedRationale: string;
  }>;
}

export type ApprovedOutlookCode = string & {
  readonly __brand: "ApprovedOutlookCode";
};
```

### Task 1: Root pnpm workspace and toolchain pins

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `.prettierignore`
- Create: `eslint.config.mjs`
- Create: `tsconfig.base.json`
- Modify: `.gitignore`
- Generated: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: repository root and the locked layout above.
- Produces: root commands `dev`, `lint`, `typecheck`, `test`, `build`, `openapi:lint`, `supabase:*`; Node 24.x and pnpm 10.33.0 pins.

- [ ] **Step 1: Verify the missing workspace fails before implementation**

Run: `pnpm install --lockfile-only`

Expected: FAIL because the repository has no root `package.json`.

- [ ] **Step 2: Add the root package manifest**

Create `package.json`:

```json
{
  "name": "mulsigye-monorepo",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": "24.x",
    "pnpm": "10.33.0"
  },
  "scripts": {
    "dev": "pnpm --filter @mulsigye/web dev",
    "lint": "pnpm -r --if-present lint",
    "typecheck": "pnpm -r --if-present typecheck",
    "test": "pnpm -r --if-present test",
    "build": "pnpm -r --if-present build",
    "format:check": "prettier --check \"apps/web/**/*.{ts,tsx,css,json,mjs}\" \"packages/**/*.{ts,json,yaml}\" \"*.{json,yaml,mjs}\"",
    "openapi:lint": "pnpm --filter @mulsigye/contracts lint",
    "supabase:start": "supabase --workdir infra/supabase start -x auth,realtime,storage,imgproxy,inbucket,edge-runtime,logflare,vector",
    "supabase:reset": "supabase --workdir infra/supabase db reset --local",
    "supabase:lint": "supabase --workdir infra/supabase db lint --local --level error",
    "supabase:test": "supabase --workdir infra/supabase test db",
    "supabase:stop": "supabase --workdir infra/supabase stop --no-backup"
  },
  "devDependencies": {
    "eslint": "10.7.0",
    "prettier": "3.9.5",
    "supabase": "2.109.1",
    "typescript": "7.0.2",
    "typescript-eslint": "8.64.0"
  }
}
```

- [ ] **Step 3: Add workspace and compiler configuration**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/web
  - packages/*
```

Create `.nvmrc`:

```text
24.13.0
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

Create `.prettierignore`:

```text
.next
build
coverage
node_modules
pnpm-lock.yaml
apps/android/.gradle
apps/android/gradle/wrapper/gradle-wrapper.jar
apps/android/**/build
prototype
공모전 문서
```

Create `eslint.config.mjs`:

```js
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      "packages/contracts/src/generated/**",
      "prototype/**"
    ]
  },
  ...tseslint.configs.recommended
);
```

- [ ] **Step 4: Align ignore rules with the new paths**

Replace the Supabase and Android portions of `.gitignore` with:

```gitignore
# Supabase local state
infra/supabase/.branches/
infra/supabase/.temp/

# Android / Gradle / signing
apps/android/.gradle/
apps/android/**/build/
apps/android/local.properties
local.properties
keystore.properties
*.jks
*.keystore
*.aab
*.apk
```

- [ ] **Step 5: Install and lock the root toolchain**

Run: `corepack enable`

Expected: PASS with Corepack enabled.

Run: `pnpm install`

Expected: PASS and create `pnpm-lock.yaml`.

Run: `pnpm exec prettier --version`

Expected: `3.9.5`.

- [ ] **Step 6: Commit the root workspace**

```powershell
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .nvmrc .prettierignore eslint.config.mjs tsconfig.base.json .gitignore
git commit -m "chore: 모노레포 루트 도구 구성"
```

### Task 2: OpenAPI contract package and health fixture

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/openapi.yaml`
- Create: `packages/contracts/examples/health.ok.json`
- Create: `packages/contracts/examples/health.error.json`
- Create: `packages/contracts/src/index.ts`
- Generate: `packages/contracts/src/generated/openapi.ts`
- Test: `packages/contracts/test/health-contract.test.ts`

**Interfaces:**
- Consumes: root TypeScript config and pnpm workspace.
- Produces: `HealthResponse`, `ApiError`, shared JSON fixtures, `packages/contracts/openapi.yaml` as the only HTTP contract SSOT.

- [ ] **Step 1: Write the failing contract test**

Create `packages/contracts/test/health-contract.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";

import healthError from "../examples/health.error.json";
import healthOk from "../examples/health.ok.json";
import type { ApiError, HealthResponse } from "../src/index";

describe("health contract fixtures", () => {
  it("keeps the success fixture assignable to the generated OpenAPI type", () => {
    const contractFixture = {
      schemaVersion: "1",
      service: "mulsigye-api",
      status: "ok",
      asOf: "2026-07-19T00:00:00.000Z",
      sources: [],
      stale: false
    } satisfies HealthResponse;

    expectTypeOf(contractFixture).toMatchTypeOf<HealthResponse>();
    expect(healthOk).toEqual(contractFixture);
  });

  it("keeps the error fixture assignable to the generated OpenAPI type", () => {
    expectTypeOf(healthError).toMatchTypeOf<ApiError>();
    expect(healthError.retryable).toBe(true);
  });
});
```

Run: `pnpm --filter @mulsigye/contracts --fail-if-no-match test`

Expected: FAIL because the workspace package and generated types do not exist.

- [ ] **Step 2: Create the package and exact fixtures**

Create `packages/contracts/package.json`:

```json
{
  "name": "@mulsigye/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "generate": "openapi-typescript openapi.yaml -o src/generated/openapi.ts",
    "lint": "redocly lint openapi.yaml",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  },
  "devDependencies": {
    "@redocly/cli": "2.39.0",
    "openapi-typescript": "7.13.0",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

Create `packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true
  },
  "include": ["src", "test", "examples"]
}
```

Create `packages/contracts/examples/health.ok.json`:

```json
{
  "schemaVersion": "1",
  "service": "mulsigye-api",
  "status": "ok",
  "asOf": "2026-07-19T00:00:00.000Z",
  "sources": [],
  "stale": false
}
```

Create `packages/contracts/examples/health.error.json`:

```json
{
  "code": "SERVICE_UNAVAILABLE",
  "message": "잠시 후 다시 시도해 주세요.",
  "retryable": true
}
```

- [ ] **Step 3: Define the complete health OpenAPI contract**

Create `packages/contracts/openapi.yaml`:

```yaml
openapi: 3.1.0
info:
  title: Mulsigye API
  version: 1.0.0
  description: 물시계 웹과 Android가 함께 소비하는 버전 고정 API 계약
paths:
  /api/v1/health:
    get:
      operationId: getHealth
      summary: 공개 API 프로세스 상태 확인
      responses:
        "200":
          description: API가 요청을 받을 수 있음
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthResponse"
              examples:
                ok:
                  value:
                    schemaVersion: "1"
                    service: mulsigye-api
                    status: ok
                    asOf: "2026-07-19T00:00:00.000Z"
                    sources: []
                    stale: false
        "503":
          description: API 프로세스가 요청을 처리할 수 없음
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ApiError"
components:
  schemas:
    HealthResponse:
      type: object
      additionalProperties: false
      required:
        - schemaVersion
        - service
        - status
        - asOf
        - sources
        - stale
      properties:
        schemaVersion:
          type: string
          const: "1"
        service:
          type: string
          const: mulsigye-api
        status:
          type: string
          const: ok
        asOf:
          type: string
          format: date-time
        sources:
          type: array
          items:
            type: string
        stale:
          type: boolean
    ApiError:
      type: object
      additionalProperties: false
      required:
        - code
        - message
        - retryable
      properties:
        code:
          type: string
          minLength: 1
        message:
          type: string
          minLength: 1
        retryable:
          type: boolean
```

- [ ] **Step 4: Generate and export TypeScript types**

Create `packages/contracts/src/index.ts`:

```ts
import type { components } from "./generated/openapi.js";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type ApiError = components["schemas"]["ApiError"];
```

Run: `pnpm install`

Expected: PASS and link `@mulsigye/contracts` into the workspace.

Run: `pnpm --filter @mulsigye/contracts generate`

Expected: PASS and create `packages/contracts/src/generated/openapi.ts`.

- [ ] **Step 5: Verify contract lint, types, and fixtures**

Run: `pnpm openapi:lint`

Expected: PASS with one valid OpenAPI definition.

Run: `pnpm --filter @mulsigye/contracts typecheck`

Expected: PASS with zero TypeScript errors.

Run: `pnpm --filter @mulsigye/contracts test`

Expected: PASS with 2 tests.

- [ ] **Step 6: Commit the contract package**

```powershell
git add packages/contracts pnpm-lock.yaml
git commit -m "feat(api): health OpenAPI 계약 추가"
```

### Task 3: Server-only LLM package with safe static provider

**Files:**
- Create: `packages/llm/package.json`
- Create: `packages/llm/tsconfig.json`
- Create: `packages/llm/src/types.ts`
- Create: `packages/llm/src/generated-coach-schema.ts`
- Create: `packages/llm/src/coach-validator.ts`
- Create: `packages/llm/src/static-coach-provider.ts`
- Create: `packages/llm/src/constants.ts`
- Create: `packages/llm/src/index.ts`
- Test: `packages/llm/test/static-coach-provider.test.ts`
- Test: `packages/llm/test/coach-validator.test.ts`

**Interfaces:**
- Consumes: approved LLM design and Zod runtime validation.
- Produces: `CoachProvider`, `CoachFactPacket`, `GeneratedCoachCopy`, `StaticCoachProvider`, `validateGeneratedCoachCopy`, model constant `claude-opus-4-7`.
- Safety boundary: this task deliberately does not export a public `/api/v1/coach` route. The live adapter is connected only after state data, Supabase cache/lock, and budget guard exist.

- [ ] **Step 1: Write failing provider and validator tests**

Create `packages/llm/test/static-coach-provider.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { StaticCoachProvider } from "../src/static-coach-provider";
import type { CoachFactPacket } from "../src/types";

const facts: CoachFactPacket = {
  factSchemaVersion: "1",
  officialStage: "주의",
  season: "여름",
  reachBucket: "within_14d",
  trendBucket: "falling",
  highWaterNotice: false,
  officialOutlookCode: null,
  actions: [
    {
      id: "check-field-water",
      approvedTitle: "논물 상태를 확인해요",
      approvedRationale: "물이 새는 곳이 없는지 먼저 살펴봐요."
    },
    {
      id: "share-schedule",
      approvedTitle: "급수 일정을 이웃과 맞춰요",
      approvedRationale: "같은 시간에 물이 몰리지 않게 일정을 나눠요."
    }
  ]
};

describe("StaticCoachProvider", () => {
  it("preserves action ids, count, and order", async () => {
    const result = await new StaticCoachProvider().generate(facts);

    expect(result.actions.map(({ id }) => id)).toEqual([
      "check-field-water",
      "share-schedule"
    ]);
    expect(result.headline.endsWith("해요.")).toBe(true);
    expect(result.summary).toContain("공식 가뭄 예·경보");
  });
});
```

Create `packages/llm/test/coach-validator.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { validateGeneratedCoachCopy } from "../src/coach-validator";
import type { CoachFactPacket } from "../src/types";

const facts: CoachFactPacket = {
  factSchemaVersion: "1",
  officialStage: "관심",
  season: "여름",
  reachBucket: "within_30d",
  trendBucket: "falling",
  highWaterNotice: false,
  officialOutlookCode: null,
  actions: [
    {
      id: "check-field-water",
      approvedTitle: "논물 상태를 확인해요",
      approvedRationale: "물이 새는 곳이 없는지 먼저 살펴봐요."
    }
  ]
};

describe("validateGeneratedCoachCopy", () => {
  it("rejects a changed action id", () => {
    expect(() =>
      validateGeneratedCoachCopy(facts, {
        headline: "지금 물 상황을 살펴봐요.",
        summary: "예측은 참고 정보예요.",
        actions: [{ id: "invented-action", reason: "새 행동을 해요." }]
      })
    ).toThrow("ACTION_IDS_MISMATCH");
  });

  it.each(["위험합니다", "발생합니다", "됩니다"])(
    "rejects forbidden assertion %s",
    (forbidden) => {
      expect(() =>
        validateGeneratedCoachCopy(facts, {
          headline: forbidden,
          summary: "예측은 참고 정보예요.",
          actions: [
            { id: "check-field-water", reason: "논물 상태를 살펴봐요." }
          ]
        })
      ).toThrow("FORBIDDEN_ASSERTION");
    }
  );
});
```

Run: `pnpm --filter @mulsigye/llm --fail-if-no-match test`

Expected: FAIL because the package and implementation do not exist.

- [ ] **Step 2: Create the LLM package and public types**

Create `packages/llm/package.json`:

```json
{
  "name": "@mulsigye/llm",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "0.112.3",
    "server-only": "0.0.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "eslint": "10.7.0",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

Create `packages/llm/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

Create `packages/llm/src/types.ts`:

```ts
export type OfficialStage = "정상" | "관심" | "주의" | "경계" | "심각";
export type Season = "봄" | "여름" | "가을" | "겨울";
export type ReachBucket =
  | "none"
  | "within_7d"
  | "within_14d"
  | "within_30d";
export type TrendBucket = "rising" | "stable" | "falling";
export type ApprovedOutlookCode = string & {
  readonly __brand: "ApprovedOutlookCode";
};

export type ApprovedAction = {
  id: string;
  approvedTitle: string;
  approvedRationale: string;
};

export type CoachFactPacket = {
  factSchemaVersion: "1";
  officialStage: OfficialStage;
  season: Season;
  reachBucket: ReachBucket;
  trendBucket: TrendBucket;
  highWaterNotice: boolean;
  officialOutlookCode: ApprovedOutlookCode | null;
  actions: ApprovedAction[];
};

export type GeneratedCoachCopy = {
  headline: string;
  summary: string;
  actions: Array<{ id: string; reason: string }>;
};

export interface CoachProvider {
  generate(facts: CoachFactPacket): Promise<GeneratedCoachCopy>;
}
```

Create `packages/llm/src/constants.ts`:

```ts
export const ANTHROPIC_MODEL = "claude-opus-4-7" as const;
export const LLM_TIMEOUT_MS = 4_000;
export const LLM_MAX_TOKENS = 256;
```

- [ ] **Step 3: Implement structural and semantic validation**

Create `packages/llm/src/generated-coach-schema.ts`:

```ts
import { z } from "zod";

export const generatedCoachCopySchema = z
  .object({
    headline: z.string().min(1).max(30),
    summary: z.string().min(1).max(100),
    actions: z
      .array(
        z
          .object({
            id: z.string().min(1),
            reason: z.string().min(1).max(70)
          })
          .strict()
      )
      .min(1)
      .max(3)
  })
  .strict();
```

Create `packages/llm/src/coach-validator.ts`:

```ts
import { generatedCoachCopySchema } from "./generated-coach-schema.js";
import type { CoachFactPacket, GeneratedCoachCopy } from "./types.js";

const FORBIDDEN_ASSERTIONS = ["위험합니다", "발생합니다", "됩니다"];

export function validateGeneratedCoachCopy(
  facts: CoachFactPacket,
  candidate: unknown
): GeneratedCoachCopy {
  const parsed = generatedCoachCopySchema.parse(candidate);
  const expectedIds = facts.actions.map(({ id }) => id);
  const actualIds = parsed.actions.map(({ id }) => id);

  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    throw new Error("ACTION_IDS_MISMATCH");
  }

  const visibleCopy = [
    parsed.headline,
    parsed.summary,
    ...parsed.actions.map(({ reason }) => reason)
  ].join(" ");

  if (FORBIDDEN_ASSERTIONS.some((word) => visibleCopy.includes(word))) {
    throw new Error("FORBIDDEN_ASSERTION");
  }

  return parsed;
}
```

- [ ] **Step 4: Implement the deterministic static provider**

Create `packages/llm/src/static-coach-provider.ts`:

```ts
import { validateGeneratedCoachCopy } from "./coach-validator.js";
import type {
  CoachFactPacket,
  CoachProvider,
  GeneratedCoachCopy,
  OfficialStage
} from "./types.js";

const HEADLINES: Record<OfficialStage, string> = {
  정상: "지금처럼 물 상황을 살펴봐요.",
  관심: "우리 지역 물 흐름을 살펴봐요.",
  주의: "지금 할 일을 하나씩 확인해요.",
  경계: "물을 아껴 쓸 준비를 해요.",
  심각: "공식 안내를 먼저 확인해요."
};

export class StaticCoachProvider implements CoachProvider {
  async generate(facts: CoachFactPacket): Promise<GeneratedCoachCopy> {
    return validateGeneratedCoachCopy(facts, {
      headline: HEADLINES[facts.officialStage],
      summary: "예측은 참고 정보예요. 공식 가뭄 예·경보를 먼저 확인해요.",
      actions: facts.actions.slice(0, 3).map(({ id, approvedRationale }) => ({
        id,
        reason: approvedRationale
      }))
    });
  }
}
```

Create `packages/llm/src/index.ts`:

```ts
import "server-only";

export * from "./coach-validator.js";
export * from "./constants.js";
export * from "./generated-coach-schema.js";
export * from "./static-coach-provider.js";
export * from "./types.js";
```

- [ ] **Step 5: Verify the safe LLM boundary**

Run: `pnpm install`

Expected: PASS and lock exact Anthropic/Zod dependencies.

Run: `pnpm --filter @mulsigye/llm typecheck`

Expected: PASS with zero TypeScript errors.

Run: `pnpm --filter @mulsigye/llm test`

Expected: PASS with 5 test cases.

- [ ] **Step 6: Commit the LLM foundation**

```powershell
git add packages/llm pnpm-lock.yaml
git commit -m "feat(llm): 안전한 정적 코치 경계 추가"
```

### Task 4: Next.js web app and health vertical slice

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/eslint.config.mjs`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/test/setup.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/page.module.css`
- Create: `apps/web/src/app/globals.css`
- Download: `apps/web/src/app/fonts/PretendardVariable.woff2`
- Download: `apps/web/src/app/fonts/OFL.txt`
- Create: `apps/web/src/app/api/v1/health/route.ts`
- Create: `apps/web/src/components/HealthCard.tsx`
- Create: `apps/web/src/components/HealthCard.module.css`
- Test: `apps/web/src/app/api/v1/health/route.test.ts`
- Test: `apps/web/src/components/HealthCard.test.tsx`

**Interfaces:**
- Consumes: `HealthResponse` from `@mulsigye/contracts`.
- Produces: `GET /api/v1/health`, a responsive page that actually calls the endpoint, and Vercel-buildable `@mulsigye/web`.
- Does not produce: a public coach route, fake drought data, login, notifications, or a Supabase/Anthropic browser client.

- [ ] **Step 1: Write the failing Route Handler and UI tests**

Create `apps/web/src/app/api/v1/health/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createHealthResponse, GET } from "./route";

describe("GET /api/v1/health", () => {
  it("returns the versioned OpenAPI payload", async () => {
    const fixedNow = new Date("2026-07-19T00:00:00.000Z");

    expect(createHealthResponse(fixedNow)).toEqual({
      schemaVersion: "1",
      service: "mulsigye-api",
      status: "ok",
      asOf: fixedNow.toISOString(),
      sources: [],
      stale: false
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
```

Create `apps/web/src/components/HealthCard.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HealthCard } from "./HealthCard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HealthCard", () => {
  it("shows the connected state from the shared health API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: "1",
            service: "mulsigye-api",
            status: "ok",
            asOf: "2026-07-19T00:00:00.000Z",
            sources: [],
            stale: false
          }),
          { status: 200 }
        )
      )
    );

    render(<HealthCard />);

    expect(screen.getByText("물시계를 준비하고 있어요.")).toBeInTheDocument();
    expect(
      await screen.findByText("물시계 서버와 연결됐어요.")
    ).toBeInTheDocument();
  });

  it("offers an explicit retry when the API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<HealthCard />);

    expect(
      await screen.findByRole("button", { name: "다시 시도하기" })
    ).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @mulsigye/web --fail-if-no-match test`

Expected: FAIL because the web workspace and implementations do not exist.

- [ ] **Step 2: Create the exact Next.js package configuration**

Create `apps/web/package.json`:

```json
{
  "name": "@mulsigye/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@mulsigye/contracts": "workspace:*",
    "@mulsigye/llm": "workspace:*",
    "next": "16.2.10",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "26.1.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "eslint": "10.7.0",
    "eslint-config-next": "16.2.10",
    "jsdom": "29.1.1",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

Create `apps/web/next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is generated-compatible and must remain free of application code.
```

Create `apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mulsigye/contracts", "@mulsigye/llm"]
};

export default nextConfig;
```

Create `apps/web/eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "coverage/**", "next-env.d.ts"])
]);
```

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"]
  }
});
```

Create `apps/web/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Vendor the approved self-hosted Korean font**

Run:

```powershell
New-Item -ItemType Directory -Force apps/web/src/app/fonts
Invoke-WebRequest "https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2" -OutFile "apps/web/src/app/fonts/PretendardVariable.woff2"
Invoke-WebRequest "https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/LICENSE" -OutFile "apps/web/src/app/fonts/OFL.txt"
```

Expected: both files exist in the repository and no runtime font CDN is needed.

- [ ] **Step 4: Implement the versioned health Route Handler**

Create `apps/web/src/app/api/v1/health/route.ts`:

```ts
import type { HealthResponse } from "@mulsigye/contracts";

export const dynamic = "force-dynamic";

export function createHealthResponse(now: Date): HealthResponse {
  return {
    schemaVersion: "1",
    service: "mulsigye-api",
    status: "ok",
    asOf: now.toISOString(),
    sources: [],
    stale: false
  };
}

export function GET(): Response {
  return Response.json(createHealthResponse(new Date()), {
    status: 200,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
```

- [ ] **Step 5: Implement the health UI states**

Create `apps/web/src/components/HealthCard.tsx`:

```tsx
"use client";

import type { HealthResponse } from "@mulsigye/contracts";
import { useCallback, useEffect, useState } from "react";

import styles from "./HealthCard.module.css";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; data: HealthResponse }
  | { kind: "error" };

export function HealthCard() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });

    try {
      const response = await fetch("/api/v1/health", {
        cache: "no-store",
        signal
      });

      if (!response.ok) {
        throw new Error(`health request failed: ${response.status}`);
      }

      const data = (await response.json()) as HealthResponse;
      setState({ kind: "ready", data });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.kind === "loading") {
    return <p className={styles.message}>물시계를 준비하고 있어요.</p>;
  }

  if (state.kind === "error") {
    return (
      <section className={styles.card} aria-live="polite">
        <h2>서버 연결을 확인해 주세요.</h2>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button className={styles.button} type="button" onClick={() => void load()}>
          다시 시도하기
        </button>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-live="polite">
      <h2>물시계 서버와 연결됐어요.</h2>
      <p>
        {state.data.stale
          ? "최근 확인한 정보를 보여드려요."
          : "최신 정보를 받을 준비가 됐어요."}
      </p>
    </section>
  );
}
```

Create `apps/web/src/components/HealthCard.module.css`:

```css
.card {
  padding: 24px;
  border-radius: var(--radius-large);
  background: var(--gray-50);
}

.card h2,
.card p,
.message {
  margin: 0;
}

.card p {
  margin-top: 8px;
  color: var(--ink-secondary);
}

.button {
  width: 100%;
  min-height: 56px;
  margin-top: 20px;
  border: 0;
  border-radius: 16px;
  background: var(--blue);
  color: white;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.button:focus-visible {
  outline: 3px solid var(--blue-deep);
  outline-offset: 3px;
}
```

- [ ] **Step 6: Add the minimal responsive page**

Create `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-pretendard",
  weight: "45 920"
});

export const metadata: Metadata = {
  title: "물시계",
  description: "농업용수 부족 시점을 살피는 AI 물관리 코치"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body className={pretendard.variable}>{children}</body>
    </html>
  );
}
```

Create `apps/web/src/app/page.tsx`:

```tsx
import { HealthCard } from "@/components/HealthCard";

import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>AI 물관리 코치</p>
        <h1>물시계</h1>
        <p>우리 지역 물 사정을 살피고, 지금 할 일을 쉬운 말로 알려드려요.</p>
      </section>
      <HealthCard />
      <p className={styles.notice}>
        예측은 참고 정보예요. 공식 가뭄 예·경보를 먼저 확인해 주세요.
      </p>
    </main>
  );
}
```

Create `apps/web/src/app/page.module.css`:

```css
.main {
  display: grid;
  gap: 24px;
  width: min(100% - 32px, 560px);
  margin: 0 auto;
  padding: 48px 0;
}

.hero {
  display: grid;
  gap: 8px;
}

.hero h1,
.hero p {
  margin: 0;
}

.hero h1 {
  font-size: clamp(2.5rem, 10vw, 4rem);
}

.eyebrow {
  color: var(--blue-deep);
  font-weight: 700;
}

.notice {
  margin: 0;
  color: var(--ink-secondary);
  font-size: 0.9375rem;
}
```

Create `apps/web/src/app/globals.css`:

```css
:root {
  --ink: #191f28;
  --ink-secondary: #4e5968;
  --gray-50: #f9fafb;
  --blue: #3182f6;
  --blue-deep: #1b64da;
  --radius-large: 24px;
  color: var(--ink);
  background: #ffffff;
  font-family:
    var(--font-pretendard),
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
}

button {
  min-width: 48px;
  min-height: 48px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 7: Verify the web slice**

Run: `pnpm install`

Expected: PASS and link both workspace packages.

Run: `pnpm --filter @mulsigye/web test`

Expected: PASS with 3 web tests.

Run: `pnpm --filter @mulsigye/web lint`

Expected: PASS with zero ESLint errors.

Run: `pnpm --filter @mulsigye/web typecheck`

Expected: PASS with zero TypeScript errors.

Run: `pnpm --filter @mulsigye/web build`

Expected: PASS and list both `/` and `/api/v1/health`.

Run the server: `pnpm dev`

In a second PowerShell session run:

```powershell
$response = Invoke-RestMethod http://localhost:3000/api/v1/health
$response.status
```

Expected: `ok`.

- [ ] **Step 8: Commit the web vertical slice**

```powershell
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): health 세로 조각 추가"
```

### Task 5: Supabase infrastructure and protected LLM tables

**Files:**
- Create: `infra/supabase/config.toml`
- Create: `infra/supabase/migrations/20260719000100_create_llm_coach_tables.sql`
- Test: `infra/supabase/tests/coach_tables_test.sql`

**Interfaces:**
- Consumes: approved cache, generation lock, usage metadata, privacy, and cost design.
- Produces: append-only PostgreSQL schema for `coach_cache`, `coach_generation_locks`, and `llm_usage`; RLS enabled; no public policy.
- Does not produce: Auth tables, user profiles, address storage, prompt/response text logs, or a public Supabase client.

- [ ] **Step 1: Create the failing pgTAP contract**

Create `infra/supabase/tests/coach_tables_test.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'coach_cache', 'coach_cache exists');
select has_table('public', 'coach_generation_locks', 'coach_generation_locks exists');
select has_table('public', 'llm_usage', 'llm_usage exists');

select has_column('public', 'coach_cache', 'cache_key', 'coach_cache has cache_key');
select has_column(
  'public',
  'coach_generation_locks',
  'locked_until',
  'coach_generation_locks has locked_until'
);
select has_column('public', 'llm_usage', 'estimated_cost_usd', 'llm_usage has cost');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.coach_cache'::regclass),
  'coach_cache has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.coach_generation_locks'::regclass
  ),
  'coach_generation_locks has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.llm_usage'::regclass),
  'llm_usage has RLS enabled'
);

select is(
  (select count(*)::integer from pg_policies where tablename = 'coach_cache'),
  0,
  'coach_cache exposes no policy'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where tablename = 'coach_generation_locks'
  ),
  0,
  'coach_generation_locks exposes no policy'
);
select is(
  (select count(*)::integer from pg_policies where tablename = 'llm_usage'),
  0,
  'llm_usage exposes no policy'
);

select * from finish();

rollback;
```

Run: `pnpm supabase:start`

Expected: PASS on a machine with Docker Desktop or the GitHub Ubuntu runner.

Run: `pnpm supabase:test`

Expected: FAIL because the three tables do not exist.

- [ ] **Step 2: Add the minimal local Supabase configuration**

Create `infra/supabase/config.toml`:

```toml
project_id = "mulsigye"

[api]
enabled = true
port = 54321
schemas = ["public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 17

[db.seed]
enabled = false

[studio]
enabled = false

[inbucket]
enabled = false

[auth]
enabled = false

[storage]
enabled = false

[realtime]
enabled = false

[analytics]
enabled = false
```

- [ ] **Step 3: Add the append-only LLM schema migration**

Create `infra/supabase/migrations/20260719000100_create_llm_coach_tables.sql`:

```sql
create extension if not exists pgcrypto with schema extensions;

create table public.coach_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  fact_schema_version text not null,
  prompt_version text not null,
  action_catalog_version text not null,
  provider text not null,
  model text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(10, 6)
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  validation_status text not null
    check (validation_status = 'valid'),
  generation_source text not null
    check (generation_source in ('anthropic_api', 'claude_max_seed', 'static')),
  constraint coach_cache_expiry_after_creation check (expires_at > created_at)
);

create index coach_cache_expires_at_idx
  on public.coach_cache (expires_at);

create table public.coach_generation_locks (
  cache_key text primary key,
  locked_until timestamptz not null,
  created_at timestamptz not null default now()
);

create index coach_generation_locks_locked_until_idx
  on public.coach_generation_locks (locked_until);

create table public.llm_usage (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  context_hash text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  estimated_cost_usd numeric(10, 6) not null
    check (estimated_cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  result_code text not null
);

create index llm_usage_occurred_at_idx
  on public.llm_usage (occurred_at);

alter table public.coach_cache enable row level security;
alter table public.coach_generation_locks enable row level security;
alter table public.llm_usage enable row level security;

revoke all on table public.coach_cache from anon, authenticated;
revoke all on table public.coach_generation_locks from anon, authenticated;
revoke all on table public.llm_usage from anon, authenticated;
```

- [ ] **Step 4: Rebuild and verify the schema**

Run: `pnpm supabase:reset`

Expected: PASS and apply `20260719000100_create_llm_coach_tables.sql`.

Run: `pnpm supabase:lint`

Expected: PASS with no error-level database lint findings.

Run: `pnpm supabase:test`

Expected: PASS with `1..12` and 12 successful assertions.

Run: `pnpm supabase:stop`

Expected: PASS and stop the local stack without a backup.

- [ ] **Step 5: Commit the infrastructure foundation**

```powershell
git add infra/supabase
git commit -m "feat(infra): LLM 캐시 스키마 추가"
```

### Task 6: Android Gradle project and health repository

**Files:**
- Create: `apps/android/settings.gradle.kts`
- Create: `apps/android/build.gradle.kts`
- Create: `apps/android/gradle.properties`
- Create: `apps/android/gradle/libs.versions.toml`
- Generate: `apps/android/gradlew`
- Generate: `apps/android/gradlew.bat`
- Generate: `apps/android/gradle/wrapper/gradle-wrapper.jar`
- Generate and modify: `apps/android/gradle/wrapper/gradle-wrapper.properties`
- Create: `apps/android/app/build.gradle.kts`
- Create: `apps/android/app/proguard-rules.pro`
- Create: `apps/android/app/src/main/AndroidManifest.xml`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/MulsigyeApplication.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/app/AppContainer.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/core/network/ApiClient.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/core/network/ApiErrorDto.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/data/remote/HealthApi.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/data/remote/HealthResponseDto.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/data/DefaultHealthRepository.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/domain/HealthRepository.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/domain/HealthResult.kt`
- Create: `apps/android/app/src/main/res/values/strings.xml`
- Test: `apps/android/app/src/test/kotlin/com/mulsigye/app/feature/health/data/HealthResponseDtoTest.kt`
- Test: `apps/android/app/src/test/kotlin/com/mulsigye/app/feature/health/data/DefaultHealthRepositoryTest.kt`

**Interfaces:**
- Consumes: `GET /api/v1/health`, `HealthResponse`, and `ApiError` fields from the OpenAPI package.
- Produces: `HealthRepository.load(): HealthResult`, a native Retrofit client, and a reproducible Android build.
- Does not produce: WebView, client-side drought logic, navigation, local persistence, login, notifications, or direct KRC/Supabase/Anthropic calls.

- [ ] **Step 1: Write the failing DTO and repository tests**

Create `apps/android/app/src/test/kotlin/com/mulsigye/app/feature/health/data/HealthResponseDtoTest.kt`:

```kotlin
package com.mulsigye.app.feature.health.data

import com.mulsigye.app.feature.health.data.remote.HealthResponseDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthResponseDtoTest {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }

    @Test
    fun decodesTheSharedOpenApiFixture() {
        val decoded = json.decodeFromString<HealthResponseDto>(
            """
            {
              "schemaVersion": "1",
              "service": "mulsigye-api",
              "status": "ok",
              "asOf": "2026-07-19T00:00:00.000Z",
              "sources": [],
              "stale": false
            }
            """.trimIndent()
        )

        assertEquals("1", decoded.schemaVersion)
        assertEquals("mulsigye-api", decoded.service)
        assertEquals(false, decoded.stale)
    }
}
```

Create `apps/android/app/src/test/kotlin/com/mulsigye/app/feature/health/data/DefaultHealthRepositoryTest.kt`:

```kotlin
package com.mulsigye.app.feature.health.data

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.feature.health.data.remote.HealthApi
import com.mulsigye.app.feature.health.domain.HealthResult
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DefaultHealthRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultHealthRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json)
            .create(HealthApi::class.java)
        repository = DefaultHealthRepository(api, json)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun mapsFreshSuccessWithoutChangingServerValues() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "schemaVersion": "1",
                      "service": "mulsigye-api",
                      "status": "ok",
                      "asOf": "2026-07-19T00:00:00.000Z",
                      "sources": [],
                      "stale": false
                    }
                    """.trimIndent()
                )
        )

        val result = repository.load()

        assertTrue(result is HealthResult.Success)
        result as HealthResult.Success
        assertEquals("2026-07-19T00:00:00Z", result.asOf.toString())
        assertEquals(false, result.stale)
    }

    @Test
    fun preservesRetryableServerErrors() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(503)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "code": "SERVICE_UNAVAILABLE",
                      "message": "잠시 후 다시 시도해 주세요.",
                      "retryable": true
                    }
                    """.trimIndent()
                )
        )

        val result = repository.load()

        assertEquals(
            HealthResult.Failure(
                code = "SERVICE_UNAVAILABLE",
                message = "잠시 후 다시 시도해 주세요.",
                retryable = true
            ),
            result
        )
    }

    @Test
    fun preservesTheServerStaleFlag() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "schemaVersion": "1",
                      "service": "mulsigye-api",
                      "status": "ok",
                      "asOf": "2026-07-19T00:00:00.000Z",
                      "sources": ["cached-krc"],
                      "stale": true
                    }
                    """.trimIndent()
                )
        )

        val result = repository.load() as HealthResult.Success

        assertEquals(true, result.stale)
        assertEquals(listOf("cached-krc"), result.sources)
    }

    @Test
    fun rejectsMalformedSuccessJson() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"status":"ok"}""")
        )

        assertEquals(
            HealthResult.Failure(
                code = "INVALID_RESPONSE",
                message = "받은 정보를 확인하지 못했어요.",
                retryable = true
            ),
            repository.load()
        )
    }
}
```

Run:

```powershell
./apps/android/gradlew.bat -p ./apps/android :app:testDebugUnitTest
```

Expected: FAIL because the Gradle project and Android source do not exist.

- [ ] **Step 2: Create the Android build configuration**

Create `apps/android/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "MulsigyeAndroid"
include(":app")
```

Create `apps/android/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
```

Create `apps/android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
```

Create `apps/android/gradle/libs.versions.toml`:

```toml
[versions]
agp = "8.13.2"
kotlin = "2.3.21"
composeBom = "2026.06.00"
activityCompose = "1.12.4"
coreKtx = "1.17.0"
lifecycle = "2.10.0"
retrofit = "2.11.0"
okhttp = "4.12.0"
serializationJson = "1.9.0"
coroutines = "1.10.2"
junit = "4.13.2"

[libraries]
androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "coreKtx" }
androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }
androidx-lifecycle-runtime-ktx = { module = "androidx.lifecycle:lifecycle-runtime-ktx", version.ref = "lifecycle" }
androidx-lifecycle-runtime-compose = { module = "androidx.lifecycle:lifecycle-runtime-compose", version.ref = "lifecycle" }
androidx-lifecycle-viewmodel-compose = { module = "androidx.lifecycle:lifecycle-viewmodel-compose", version.ref = "lifecycle" }
androidx-compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { module = "androidx.compose.ui:ui" }
androidx-compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }
androidx-compose-ui-tooling = { module = "androidx.compose.ui:ui-tooling" }
androidx-compose-material3 = { module = "androidx.compose.material3:material3" }
retrofit-core = { module = "com.squareup.retrofit2:retrofit", version.ref = "retrofit" }
retrofit-kotlinx = { module = "com.squareup.retrofit2:converter-kotlinx-serialization", version.ref = "retrofit" }
okhttp-core = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
okhttp-mockwebserver = { module = "com.squareup.okhttp3:mockwebserver", version.ref = "okhttp" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serializationJson" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
kotlinx-coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
junit = { module = "junit:junit", version.ref = "junit" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
```

Create `apps/android/app/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val configuredApiBaseUrl = providers.gradleProperty("MULSIGYE_API_BASE_URL")
val releaseRequested = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}

configuredApiBaseUrl.orNull?.let { configuredUrl ->
    require(configuredUrl.endsWith("/")) {
        "MULSIGYE_API_BASE_URL must end with a slash."
    }
}

if (releaseRequested) {
    val releaseUrl = configuredApiBaseUrl.orNull
    require(releaseUrl?.startsWith("https://") == true) {
        "Release builds require an HTTPS MULSIGYE_API_BASE_URL Gradle property."
    }
}

android {
    namespace = "com.mulsigye.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mulsigye.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            val debugUrl = configuredApiBaseUrl.orElse("http://10.0.2.2:3000/").get()
            val quotedDebugUrl = 34.toChar().toString() + debugUrl + 34.toChar()
            buildConfigField("String", "API_BASE_URL", quotedDebugUrl)
        }
        release {
            isMinifyEnabled = false
            val releaseUrl = configuredApiBaseUrl.orElse("https://invalid.invalid/").get()
            val quotedReleaseUrl = 34.toChar().toString() + releaseUrl + 34.toChar()
            buildConfigField("String", "API_BASE_URL", quotedReleaseUrl)
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.retrofit.core)
    implementation(libs.retrofit.kotlinx)
    implementation(libs.okhttp.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}
```

Create `apps/android/app/proguard-rules.pro`:

```proguard
# Retrofit and kotlinx.serialization ship consumer rules. Add project rules only
# when the release shrinker demonstrates a concrete need.
```

- [ ] **Step 3: Generate and verify the Gradle Wrapper**

Run:

```powershell
$archive = Join-Path $env:TEMP "gradle-8.13-bin.zip"
$expanded = Join-Path $env:TEMP "mulsigye-gradle-8.13"
Invoke-WebRequest "https://services.gradle.org/distributions/gradle-8.13-bin.zip" -OutFile $archive
Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
$gradleBat = Join-Path $expanded "gradle-8.13/bin/gradle.bat"
& $gradleBat -p ./apps/android wrapper --gradle-version 8.13 --distribution-type bin
```

Expected: PASS and create both wrapper scripts plus `gradle-wrapper.jar`.

Add this line to `apps/android/gradle/wrapper/gradle-wrapper.properties` immediately after `distributionUrl`:

```properties
distributionSha256Sum=20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78
```

Run:

```powershell
./apps/android/gradlew.bat -p ./apps/android --version
```

Expected: Gradle `8.13`.

- [ ] **Step 4: Implement the health DTO and Retrofit client**

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/data/remote/HealthResponseDto.kt`:

```kotlin
package com.mulsigye.app.feature.health.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class HealthResponseDto(
    val schemaVersion: String,
    val service: String,
    val status: String,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
)
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/core/network/ApiErrorDto.kt`:

```kotlin
package com.mulsigye.app.core.network

import kotlinx.serialization.Serializable

@Serializable
data class ApiErrorDto(
    val code: String,
    val message: String,
    val retryable: Boolean,
)
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/data/remote/HealthApi.kt`:

```kotlin
package com.mulsigye.app.feature.health.data.remote

import retrofit2.Response
import retrofit2.http.GET

interface HealthApi {
    @GET("api/v1/health")
    suspend fun getHealth(): Response<HealthResponseDto>
}
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/core/network/ApiClient.kt`:

```kotlin
package com.mulsigye.app.core.network

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object ApiClient {
    fun create(baseUrl: String, json: Json): Retrofit =
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
}
```

- [ ] **Step 5: Implement deterministic repository mapping**

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/domain/HealthResult.kt`:

```kotlin
package com.mulsigye.app.feature.health.domain

import java.time.Instant

sealed interface HealthResult {
    data class Success(
        val asOf: Instant,
        val sources: List<String>,
        val stale: Boolean,
    ) : HealthResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : HealthResult
}
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/domain/HealthRepository.kt`:

```kotlin
package com.mulsigye.app.feature.health.domain

interface HealthRepository {
    suspend fun load(): HealthResult
}
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/data/DefaultHealthRepository.kt`:

```kotlin
package com.mulsigye.app.feature.health.data

import com.mulsigye.app.core.network.ApiErrorDto
import com.mulsigye.app.feature.health.data.remote.HealthApi
import com.mulsigye.app.feature.health.domain.HealthRepository
import com.mulsigye.app.feature.health.domain.HealthResult
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultHealthRepository(
    private val api: HealthApi,
    private val json: Json,
) : HealthRepository {
    override suspend fun load(): HealthResult =
        try {
            val response = api.getHealth()
            val body = response.body()

            if (response.isSuccessful && body != null) {
                if (
                    body.schemaVersion != "1" ||
                    body.service != "mulsigye-api" ||
                    body.status != "ok"
                ) {
                    invalidResponse()
                } else {
                    HealthResult.Success(
                        asOf = Instant.parse(body.asOf),
                        sources = body.sources,
                        stale = body.stale,
                    )
                }
            } else {
                val error = response.errorBody()?.string()?.let {
                    runCatching { json.decodeFromString<ApiErrorDto>(it) }.getOrNull()
                }
                HealthResult.Failure(
                    code = error?.code ?: "SERVICE_UNAVAILABLE",
                    message = error?.message ?: "잠시 후 다시 시도해 주세요.",
                    retryable = error?.retryable ?: true,
                )
            }
        } catch (_: IOException) {
            HealthResult.Failure(
                code = "NETWORK_UNAVAILABLE",
                message = "인터넷 연결을 확인해 주세요.",
                retryable = true,
            )
        } catch (_: SerializationException) {
            invalidResponse()
        } catch (_: DateTimeParseException) {
            invalidResponse()
        }

    private fun invalidResponse() =
        HealthResult.Failure(
            code = "INVALID_RESPONSE",
            message = "받은 정보를 확인하지 못했어요.",
            retryable = true,
        )
}
```

- [ ] **Step 6: Add the application-level dependency container**

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/app/AppContainer.kt`:

```kotlin
package com.mulsigye.app.app

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.feature.health.data.DefaultHealthRepository
import com.mulsigye.app.feature.health.data.remote.HealthApi
import com.mulsigye.app.feature.health.domain.HealthRepository
import kotlinx.serialization.json.Json

class AppContainer(apiBaseUrl: String) {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }
    private val retrofit = ApiClient.create(apiBaseUrl, json)

    val healthRepository: HealthRepository =
        DefaultHealthRepository(retrofit.create(HealthApi::class.java), json)
}
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/MulsigyeApplication.kt`:

```kotlin
package com.mulsigye.app

import android.app.Application
import com.mulsigye.app.app.AppContainer

class MulsigyeApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(BuildConfig.API_BASE_URL)
    }
}
```

Create `apps/android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".MulsigyeApplication"
        android:allowBackup="false"
        android:label="@string/app_name"
        android:supportsRtl="true" />
</manifest>
```

Create `apps/android/app/src/main/res/values/strings.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">물시계</string>
</resources>
```

- [ ] **Step 7: Verify repository behavior and the empty native shell**

Run:

```powershell
./apps/android/gradlew.bat -p ./apps/android :app:testDebugUnitTest
```

Expected: PASS with 5 Android unit tests.

Run:

```powershell
./apps/android/gradlew.bat -p ./apps/android :app:assembleDebug
```

Expected: PASS and produce `apps/android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 8: Commit the Android data foundation**

```powershell
git add apps/android
git commit -m "feat(android): health 저장소 기반 추가"
```

### Task 7: Android Compose health screen

**Files:**
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/MainActivity.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/app/MulsigyeApp.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/core/designsystem/theme/Color.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/core/designsystem/theme/Shape.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/core/designsystem/theme/Theme.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/core/designsystem/theme/Type.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/presentation/HealthUiState.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/presentation/HealthViewModel.kt`
- Create: `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/presentation/HealthScreen.kt`
- Create: `apps/android/app/src/debug/AndroidManifest.xml`
- Create: `apps/android/app/src/main/res/values/themes.xml`
- Modify: `apps/android/app/src/main/AndroidManifest.xml`
- Test: `apps/android/app/src/test/kotlin/com/mulsigye/app/feature/health/presentation/HealthViewModelTest.kt`

**Interfaces:**
- Consumes: `HealthRepository` and `HealthResult`.
- Produces: native Compose loading/ready/error/retry states and launcher activity.
- UI copy is short `~해요` style; retry appears only when `retryable == true`.

- [ ] **Step 1: Write the failing ViewModel transition tests**

Create `apps/android/app/src/test/kotlin/com/mulsigye/app/feature/health/presentation/HealthViewModelTest.kt`:

```kotlin
package com.mulsigye.app.feature.health.presentation

import com.mulsigye.app.feature.health.domain.HealthRepository
import com.mulsigye.app.feature.health.domain.HealthResult
import java.time.Instant
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthViewModelTest {
    @Test
    fun movesFromLoadingToReady() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repository = QueueHealthRepository(
            mutableListOf(
                HealthResult.Success(
                    asOf = Instant.parse("2026-07-19T00:00:00Z"),
                    sources = emptyList(),
                    stale = false,
                )
            )
        )

        val viewModel = HealthViewModel(repository, dispatcher)
        advanceUntilIdle()

        assertEquals(HealthUiState.Ready(stale = false), viewModel.uiState.value)
    }

    @Test
    fun retryLoadsTheRepositoryAgain() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repository = QueueHealthRepository(
            mutableListOf(
                HealthResult.Failure(
                    code = "NETWORK_UNAVAILABLE",
                    message = "인터넷 연결을 확인해 주세요.",
                    retryable = true,
                ),
                HealthResult.Success(
                    asOf = Instant.parse("2026-07-19T00:00:00Z"),
                    sources = emptyList(),
                    stale = false,
                )
            )
        )

        val viewModel = HealthViewModel(repository, dispatcher)
        advanceUntilIdle()
        assertEquals(
            HealthUiState.Error(
                message = "인터넷 연결을 확인해 주세요.",
                retryable = true,
            ),
            viewModel.uiState.value
        )

        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(HealthUiState.Ready(stale = false), viewModel.uiState.value)
        assertEquals(2, repository.callCount)
    }
}

private class QueueHealthRepository(
    private val results: MutableList<HealthResult>,
) : HealthRepository {
    var callCount = 0
        private set

    override suspend fun load(): HealthResult {
        callCount += 1
        return results.removeFirst()
    }
}
```

Run:

```powershell
./apps/android/gradlew.bat -p ./apps/android :app:testDebugUnitTest
```

Expected: FAIL because the presentation types do not exist.

- [ ] **Step 2: Implement the unidirectional health state**

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/presentation/HealthUiState.kt`:

```kotlin
package com.mulsigye.app.feature.health.presentation

sealed interface HealthUiState {
    data object Loading : HealthUiState
    data class Ready(val stale: Boolean) : HealthUiState
    data class Error(
        val message: String,
        val retryable: Boolean,
    ) : HealthUiState
}
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/presentation/HealthViewModel.kt`:

```kotlin
package com.mulsigye.app.feature.health.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mulsigye.app.feature.health.domain.HealthRepository
import com.mulsigye.app.feature.health.domain.HealthResult
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class HealthViewModel(
    private val repository: HealthRepository,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val _uiState = MutableStateFlow<HealthUiState>(HealthUiState.Loading)
    val uiState: StateFlow<HealthUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.value = HealthUiState.Loading
        viewModelScope.launch(dispatcher) {
            _uiState.value = when (val result = repository.load()) {
                is HealthResult.Success -> HealthUiState.Ready(result.stale)
                is HealthResult.Failure -> HealthUiState.Error(
                    message = result.message,
                    retryable = result.retryable,
                )
            }
        }
    }

    class Factory(
        private val repository: HealthRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(HealthViewModel::class.java))
            return HealthViewModel(repository) as T
        }
    }
}
```

- [ ] **Step 3: Implement Compose design tokens**

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/core/designsystem/theme/Color.kt`:

```kotlin
package com.mulsigye.app.core.designsystem.theme

import androidx.compose.ui.graphics.Color

val Ink = Color(0xFF191F28)
val InkSecondary = Color(0xFF4E5968)
val Gray50 = Color(0xFFF9FAFB)
val Blue = Color(0xFF3182F6)
val BlueDeep = Color(0xFF1B64DA)
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/core/designsystem/theme/Shape.kt`:

```kotlin
package com.mulsigye.app.core.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

val MulsigyeShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
)
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/core/designsystem/theme/Type.kt`:

```kotlin
package com.mulsigye.app.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val MulsigyeTypography = Typography(
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 25.sp),
    titleLarge = TextStyle(
        fontSize = 24.sp,
        lineHeight = 32.sp,
        fontWeight = FontWeight.Bold,
    ),
    displayLarge = TextStyle(
        fontSize = 48.sp,
        lineHeight = 56.sp,
        fontWeight = FontWeight.Bold,
    ),
)
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/core/designsystem/theme/Theme.kt`:

```kotlin
package com.mulsigye.app.core.designsystem.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val MulsigyeColors = lightColorScheme(
    primary = Blue,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    background = androidx.compose.ui.graphics.Color.White,
    onBackground = Ink,
    surface = Gray50,
    onSurface = Ink,
)

@Composable
fun MulsigyeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = MulsigyeColors,
        typography = MulsigyeTypography,
        shapes = MulsigyeShapes,
        content = content,
    )
}
```

- [ ] **Step 4: Implement accessible loading, ready, and error UI**

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/feature/health/presentation/HealthScreen.kt`:

```kotlin
package com.mulsigye.app.feature.health.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HealthScreen(
    state: HealthUiState,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when (state) {
                HealthUiState.Loading -> {
                    Text(
                        text = "물시계를 준비하고 있어요.",
                        style = MaterialTheme.typography.titleLarge,
                    )
                }

                is HealthUiState.Ready -> {
                    Text(
                        text = "물시계 서버와 연결됐어요.",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        text = if (state.stale) {
                            "최근 확인한 정보를 보여드려요."
                        } else {
                            "최신 정보를 받을 준비가 됐어요."
                        }
                    )
                }

                is HealthUiState.Error -> {
                    Text(
                        text = "서버 연결을 확인해 주세요.",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(text = state.message)
                    if (state.retryable) {
                        Button(
                            onClick = onRetry,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 56.dp),
                        ) {
                            Text(text = "다시 시도하기")
                        }
                    }
                }
            }
        }
    }
}
```

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/app/MulsigyeApp.kt`:

```kotlin
package com.mulsigye.app.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.feature.health.presentation.HealthScreen
import com.mulsigye.app.feature.health.presentation.HealthViewModel

@Composable
fun MulsigyeApp(container: AppContainer) {
    val healthViewModel: HealthViewModel = viewModel(
        factory = HealthViewModel.Factory(container.healthRepository)
    )
    val state by healthViewModel.uiState.collectAsStateWithLifecycle()

    MulsigyeTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Text(text = "AI 물관리 코치", color = MaterialTheme.colorScheme.primary)
            Text(text = "물시계", style = MaterialTheme.typography.displayLarge)
            Text(text = "우리 지역 물 사정을 살피고, 지금 할 일을 쉬운 말로 알려드려요.")
            HealthScreen(state = state, onRetry = healthViewModel::refresh)
            Text(
                text = "예측은 참고 정보예요. 공식 가뭄 예·경보를 먼저 확인해 주세요.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
```

- [ ] **Step 5: Add the launcher Activity and debug-only cleartext**

Create `apps/android/app/src/main/kotlin/com/mulsigye/app/MainActivity.kt`:

```kotlin
package com.mulsigye.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.mulsigye.app.app.MulsigyeApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as MulsigyeApplication).container
        setContent {
            MulsigyeApp(container)
        }
    }
}
```

Create `apps/android/app/src/main/res/values/themes.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.Mulsigye" parent="android:style/Theme.Material.Light.NoActionBar">
        <item name="android:fontFamily">sans</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:statusBarColor">#FFFFFF</item>
        <item name="android:navigationBarColor">#FFFFFF</item>
    </style>
</resources>
```

Replace `apps/android/app/src/main/AndroidManifest.xml` with:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".MulsigyeApplication"
        android:allowBackup="false"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.Mulsigye">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

Create `apps/android/app/src/debug/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:usesCleartextTraffic="true" />
</manifest>
```

- [ ] **Step 6: Verify the native health slice**

Run:

```powershell
./apps/android/gradlew.bat -p ./apps/android :app:testDebugUnitTest
```

Expected: PASS with 7 Android unit tests.

Run:

```powershell
./apps/android/gradlew.bat -p ./apps/android :app:lintDebug
```

Expected: PASS with no lint errors.

Run:

```powershell
./apps/android/gradlew.bat -p ./apps/android :app:assembleDebug
```

Expected: PASS and create a native debug APK.

- [ ] **Step 7: Commit the Android health UI**

```powershell
git add apps/android
git commit -m "feat(android): Compose health 화면 추가"
```

### Task 8: Harness orchestration, CI, and documentation synchronization

**Files:**
- Create: `scripts/check-monorepo-layout.mjs`
- Modify: `package.json`
- Create: `.github/workflows/verify.yml`
- Create: `apps/web/AGENTS.md`
- Create: `apps/android/AGENTS.md`
- Create: `packages/contracts/AGENTS.md`
- Create: `packages/llm/AGENTS.md`
- Create: `infra/supabase/AGENTS.md`
- Create: `docs/llm-coach.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/tech-stack.md`
- Modify: `docs/product.md`
- Modify: `docs/prediction-model.md`
- Modify: `docs/testing-and-feedback.md`
- Modify: `docs/work-plan.md`
- Modify: `docs/milestones.md`
- Modify: `docs/conventions.md`
- Modify: `.env.example`
- Modify: `prototype/mulsigye-app-prototype-v2.html`

**Interfaces:**
- Consumes: every path and command created in Tasks 1–7.
- Produces: a root task router, path-local agent instructions, executable CI, and synchronized SSOT documents.
- Completion rule: a path or command is marked operational only after the corresponding local or CI command succeeds.

- [ ] **Step 1: Add a failing monorepo layout gate**

Create `scripts/check-monorepo-layout.mjs`:

```js
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
```

Add this script to the root `package.json` scripts:

```json
"harness:check": "node scripts/check-monorepo-layout.mjs"
```

Run: `pnpm harness:check`

Expected: FAIL because the path-local `AGENTS.md` files and `docs/llm-coach.md` do not exist.

- [ ] **Step 2: Add path-local agent routers**

Create `apps/web/AGENTS.md`:

```markdown
# apps/web 작업 규칙

읽기 순서: `../../AGENTS.md` → `../../docs/product.md` → `../../docs/architecture.md` →
`../../docs/tech-stack.md` → UI 작업이면 `../../docs/design-system.md` →
`../../docs/testing-and-feedback.md`.

- 이 폴더는 Next.js UI와 Vercel Route Handlers만 소유한다.
- 브라우저 코드는 KRC, Supabase, Anthropic을 직접 호출하지 않는다.
- 새 HTTP 필드·경로는 `../../packages/contracts/openapi.yaml`을 먼저 바꾼다.
- 서버 도메인 계산은 `src/lib/data`, `src/lib/prediction`에 두고 React 컴포넌트에 넣지 않는다.
- 로그인, 알림, WebView를 암시하는 화면이나 카피를 만들지 않는다.
- 완료 전 `pnpm --filter @mulsigye/web lint`, `typecheck`, `test`, `build`를 각각 실행한다.
```

Create `apps/android/AGENTS.md`:

```markdown
# apps/android 작업 규칙

읽기 순서: `../../AGENTS.md` → `../../docs/product.md` → `../../docs/architecture.md` →
`../../docs/tech-stack.md` → `../../docs/design-system.md` →
`../../docs/testing-and-feedback.md`.

- Kotlin/Jetpack Compose 네이티브 앱이며 WebView와 JavaScript 브릿지는 금지한다.
- 서버의 단계·예측·대표 저수지·코치 결과를 그대로 표시하고 Android에서 다시 계산하지 않는다.
- 네트워크 DTO 변경 전에 `../../packages/contracts/openapi.yaml`을 갱신한다.
- 앱은 Vercel `/api/v1/*`만 호출하며 Supabase·KRC·Anthropic 키를 포함하지 않는다.
- 큰 글꼴, TalkBack, 48dp 터치 목표, `~해요`체를 기본 완료 조건으로 본다.
- 완료 전 Gradle `lintDebug`, `testDebugUnitTest`, `assembleDebug`를 실행한다.
```

Create `packages/contracts/AGENTS.md`:

```markdown
# packages/contracts 작업 규칙

이 폴더의 `openapi.yaml`이 웹·Android HTTP 계약의 SSOT다.

- 계약을 먼저 수정하고 Redocly lint와 TypeScript 생성을 통과시킨 뒤 두 클라이언트를 바꾼다.
- 기존 `/api/v1` 응답의 의미를 조용히 바꾸지 않는다. 비호환 변경은 `/api/v2`로 낸다.
- `rate`와 `avgRatio`, `%`와 `%p`, nullable, ISO 8601, 오류의 `retryable`을 명시한다.
- 생성된 `src/generated/openapi.ts`를 손으로 수정하지 않는다.
- 완료 전 `pnpm --filter @mulsigye/contracts generate`, `lint`, `typecheck`, `test`를 각각 실행한다.
```

Create `packages/llm/AGENTS.md`:

```markdown
# packages/llm 작업 규칙

읽기 순서: `../../AGENTS.md` → `../../docs/llm-coach.md` →
`../../docs/superpowers/specs/2026-07-19-llm-coach-design.md`.

- 서버 전용 패키지다. React, Next.js UI, Android, Supabase 구체 클라이언트 타입에 의존하지 않는다.
- Claude는 단계·수치·도달일·행동 ID·행동 순서를 생성하거나 변경하지 않는다.
- 모델은 `claude-opus-4-7`, 구조화 출력, effort low, 256 tokens, 4초, 동기 재시도 0회다.
- 캐시·lock·예산 가드 없이 Anthropic provider를 공개 Route Handler에 연결하지 않는다.
- 키 없음, timeout, 429, provider/검증 실패는 검토 완료 정적 코치로 종료한다.
- Max OAuth 토큰과 프롬프트·응답 전문을 저장소, CI, Vercel, Supabase에 넣지 않는다.
```

Create `infra/supabase/AGENTS.md`:

```markdown
# infra/supabase 작업 규칙

읽기 순서: `../../AGENTS.md` → `../../docs/architecture.md` →
`../../docs/llm-coach.md` → `../../docs/testing-and-feedback.md`.

- 마이그레이션은 timestamp 오름차순 append-only이며 이미 적용한 파일을 되돌려 쓰지 않는다.
- Auth와 사용자 프로필을 만들지 않고 주소 원문, IP, 기기 ID, 프롬프트·응답 전문을 저장하지 않는다.
- 서버 전용 테이블은 RLS를 켜고 anon/authenticated 공개 정책을 만들지 않는다.
- 브라우저·Android가 Supabase에 직접 접근하는 정책이나 공개 키 전제를 만들지 않는다.
- 완료 전 깨끗한 로컬 DB에서 reset, lint, pgTAP test를 실행한다.
```

- [ ] **Step 3: Create the implementation LLM SSOT**

Create `docs/llm-coach.md`:

```markdown
# llm-coach.md — 통제형 동적 물관리 코치

> LLM 구현·평가·운영 전에 읽는 SSOT다. 설계 근거와 승인 이력은
> `docs/superpowers/specs/2026-07-19-llm-coach-design.md`에 있다.

## 고정 결정

- Anthropic Claude API의 `claude-opus-4-7`을 사용한다.
- 추론은 Anthropic에 있고 Vercel Next.js 서버가 호출을 오케스트레이션한다.
- 웹과 Android는 `/api/v1/coach`만 소비하며 Anthropic을 직접 호출하지 않는다.
- Claude Max는 로컬 개발·수동 평가·사전 생성에만 사용한다.
- 공개 런타임은 Claude Console의 `ANTHROPIC_API_KEY`를 사용한다.
- 공모전 종료까지 live API 누적 상한은 USD 5, KST 일일 miss는 20회다.
- 실서비스를 추진할 때 인증, 모델, 비용, SLA, 개인정보를 새로 설계한다.

## 책임 경계

서버는 KRC 사실, 공인 단계, 예측, 정확한 수치·날짜, 행동 ID·순서, 면책 문구를 확정한다.
Claude는 숫자를 추가하지 않는 짧은 헤드라인·요약·행동 이유만 `~해요`체로 생성한다.
행동 ID·개수·순서 불일치, 새 숫자·날짜, 금지 단정 표현은 검증 실패다.

## 런타임 순서

1. 등록된 시군 코드와 동일 기준시각의 상태·예측을 검증한다.
2. 비식별 `CoachFactPacket`과 검토 완료 행동 최대 3개를 만든다.
3. 버전 포함 cache key로 Supabase를 조회한다.
4. miss일 때 예산·일일 한도·동시 생성 lock을 먼저 획득한다.
5. 한 요청만 Claude를 4초·256 tokens·재시도 0회로 호출한다.
6. 구조와 의미를 모두 통과한 응답만 30일 캐시한다.
7. 비활성·키 없음·Supabase 장애·예산 초과·provider/검증 실패는 정적 코치 200이다.

## 부트스트랩 현재 경계

`packages/llm`에는 타입, Zod 검증기, 정적 provider, Anthropic 모델 상수를 둔다.
실데이터 저장소, `coach_cache`, `coach_generation_locks`, `llm_usage`, 예산 가드가
자동 테스트된 변경에서만 live provider와 공개 `/api/v1/coach`를 연결한다.

## 보안과 로그

주소 원문, 지역 목록, IP, 기기 ID, 자유 입력, KRC 원문 전체를 provider payload와 로그에 넣지 않는다.
로그에는 context hash, cache hit/miss, mode, 지연, 토큰, 추정 비용, 검증 결과, 폴백 사유만 남긴다.
Max OAuth 토큰, Claude 세션, 프롬프트·응답 전문은 저장하지 않는다.

## 검증 게이트

- 입력과 출력 행동 ID·개수·순서 일치율 100%
- 새 수치·날짜·단정 표현 0건
- 모든 cache·budget·provider 실패에서 정적 폴백 100%
- cache hit에서 Anthropic 호출 0회
- 같은 key 동시 miss에서 Anthropic 호출 최대 1회
- 누적 USD 5 이후 Anthropic 호출 0회
- 기본 PR CI는 API 키 없이 fixture와 mock으로 통과
- 실제 Opus 4.7 계약 테스트는 명시적으로 보호된 수동 작업에서만 실행
```

- [ ] **Step 4: Re-run the layout gate**

Run: `pnpm harness:check`

Expected: PASS with `Monorepo layout and workspace names are valid.`.

- [ ] **Step 5: Turn the root AGENTS.md into the task orchestrator**

Replace the repository map in `AGENTS.md` with:

```text
/                              ← C:\workspace\3rd-krc-ai-digital
├── apps/
│   ├── web/                    ← Next.js UI + Vercel Route Handlers
│   └── android/                ← Kotlin/Jetpack Compose native app
├── packages/
│   ├── contracts/              ← OpenAPI 3.1 contract and fixtures
│   └── llm/                    ← server-only coach providers and validation
├── infra/
│   └── supabase/               ← config, migrations, pgTAP tests
├── data/                       ← validated snapshots and evidence artifacts
├── docs/                       ← knowledge and operations SSOT
├── prototype/                  ← interactive visual reference
├── scripts/                    ← cross-workspace checks and data CLI
├── package.json                ← pnpm command orchestrator
├── pnpm-workspace.yaml         ← apps/web + packages/*
└── AGENTS.md                   ← root task router
```

Add this row to the document index:

```markdown
| `docs/llm-coach.md` | Claude 책임 경계·비용·캐시·폴백·평가 | LLM, 코치 API, 프롬프트, 캐시 작업 전 |
```

Add this task router immediately after the document index:

```markdown
## 작업 라우터

| 작업 대상 | 시작 경로 | 반드시 함께 읽을 문서 | 최소 완료 게이트 |
|---|---|---|---|
| 웹 UI·Route Handler | `apps/web/` | product, architecture, tech-stack, design-system | web lint/typecheck/test/build |
| Android | `apps/android/` | product, architecture, tech-stack, design-system | Gradle lint/test/assemble |
| HTTP 계약 | `packages/contracts/` | architecture, data-sources | OpenAPI generate/lint/test + 두 DTO |
| LLM 코치 | `packages/llm/` | llm-coach, prediction-model | schema·semantic·fallback tests |
| Supabase | `infra/supabase/` | architecture, llm-coach, data-sources | clean reset/lint/pgTAP |
| 공공데이터·예측 | `apps/web/src/lib/`, `scripts/` | data-sources, prediction-model | fixture tests + backtest |
```

Add this non-negotiable rule:

```markdown
10. **LLM은 제품 사실을 결정하지 않는다.** 단계·예측·수치·행동 ID와 순서는 서버가
    확정하고 Claude는 쉬운 설명만 생성한다. 키·캐시·예산·공급자 장애 때도 정적 코치
    HTTP 200을 유지하며 Claude Max OAuth 자격증명을 배포 런타임에 사용하지 않는다.
```

- [ ] **Step 6: Synchronize architecture and technology SSOTs**

Apply these exact path mappings throughout `docs/architecture.md`,
`docs/tech-stack.md`, `docs/testing-and-feedback.md`, and
`docs/work-plan.md`:

```text
app/                         -> apps/web/src/app/
app/api/v1/                  -> apps/web/src/app/api/v1/
components/                  -> apps/web/src/components/
lib/data/                    -> apps/web/src/lib/data/
lib/prediction/              -> apps/web/src/lib/prediction/
android/                     -> apps/android/
contracts/openapi.yaml       -> packages/contracts/openapi.yaml
supabase/migrations/         -> infra/supabase/migrations/
android/gradle/libs...       -> apps/android/gradle/libs...
```

Replace the server dependency line in `docs/architecture.md` with:

```text
packages/contracts
      ↑
packages/llm (server-only policy/provider boundary)
      ↑
apps/web/src/lib/data + apps/web/src/lib/prediction
      ↑
apps/web/src/app/api/v1
      ↑ HTTPS
apps/web browser UI + apps/android
```

Expand the Supabase table list in `docs/architecture.md` with:

```markdown
| `coach_cache` | 상태·정책·모델 버전 hash, 검증 응답, 만료·비용 메타데이터 | 30일 검증 응답 재사용 |
| `coach_generation_locks` | `cache_key`, `locked_until` | 같은 miss의 중복 Claude 호출 방지 |
| `llm_usage` | context hash, 모델, 토큰, 비용, 지연, 결과 코드 | USD 5·일일 20회 가드 증거 |
```

Directly below that table state:

```markdown
세 LLM 테이블은 RLS를 활성화하고 공개 정책을 만들지 않는다. Next.js 서버의 service role만
접근하며 사용자 식별자, IP, 주소, 프롬프트·응답 전문을 저장하지 않는다.
```

Replace the deployment environment list in `docs/architecture.md` with:

```text
DATA_GO_KR_API_KEY, JUSO_API_KEY,
SUPABASE_URL, SUPABASE_SECRET_KEY,
LLM_ENABLED, ANTHROPIC_API_KEY, ANTHROPIC_MODEL,
LLM_PROMPT_VERSION, LLM_ACTION_CATALOG_VERSION,
LLM_TIMEOUT_MS, LLM_MAX_TOKENS,
LLM_DAILY_LIVE_MISS_LIMIT, LLM_CONTEST_BUDGET_USD
```

Delete the unresolved LLM provider/model item from `docs/architecture.md`.
Replace the LLM section in `docs/tech-stack.md` with the fixed decisions:

```markdown
## LLM 코치

| 영역 | 확정 선택 |
|---|---|
| 런타임 제공자 | Anthropic Claude API |
| 모델 | `claude-opus-4-7` |
| SDK | `@anthropic-ai/sdk@0.112.3` |
| 출력 | `output_config.format` JSON Schema + Zod 의미 검증 |
| 호출 | effort low, 256 tokens, 4초, retry 0, tools/search/RAG/streaming 없음 |
| 배치 | Anthropic 추론 + Vercel 오케스트레이션 + Supabase 검증 캐시 |
| 비용 | USD 5 누적, KST 일일 20 live miss, cache/lock 선행 |
| 개발 구독 | Max는 로컬 평가·사전 생성 전용, 공개 런타임은 Console API key |
| 장애 | 모든 장애에서 같은 행동의 정적 코치 HTTP 200 |
```

Add the exact pinned versions from this plan to `docs/tech-stack.md`, including
Node 24.x, pnpm 10.33.0, Next 16.2.10, Gradle 8.13, AGP 8.13.2,
Kotlin 2.3.21, Compose BOM 2026.06.00, and JDK 17. State that Vercel's Root
Directory is `apps/web` and Turborepo is not used.

- [ ] **Step 7: Synchronize product, prediction, schedule, and README**

Add this paragraph to the LLM portion of `docs/product.md`:

```markdown
코치는 자유 채팅이 아니라 통제형 동적 설명이다. 서버가 공인 단계·예측·행동 ID와 순서를
확정하고 Claude Opus 4.7은 그 사실을 고령 농업인이 이해하기 쉬운 짧은 `~해요`체로만
설명한다. 키·예산·캐시·공급자 장애 때도 동일 행동의 검토 완료 정적 문구를 보여준다.
```

Replace the LLM section of `docs/prediction-model.md` with:

```markdown
## LLM 행동 코치

정량 예측과 자연어 설명은 분리한다. 이 문서의 순수 함수가 `avgRatio`, 공인 단계,
도달 가능 시점과 오차를 계산하고, LLM은 그 값을 계산·수정하지 않는다. 서버가 선택한
행동 ID·개수·순서를 보존한 쉬운 이유만 생성한다. 상세 호출·캐시·비용·평가 규칙은
`docs/llm-coach.md`를 따른다.
```

In `docs/work-plan.md`:

- Change stage 1 outputs to `apps/web`, `packages/contracts/openapi.yaml`,
  `apps/android`, `infra/supabase/migrations`, and `.github/workflows/verify.yml`.
- Mark stage 1 complete only after health OpenAPI, web call, Android repository/UI,
  root JS checks, and Android CI all pass.
- Replace “LLM provider decision” with “Anthropic adapter, cache/lock, USD 5 budget
  guard, static fallback, and protected contract evaluation”.
- Change the 07-22 row to:

```markdown
| 07-19 | LLM 제공자·모델 확정 완료 | Anthropic `claude-opus-4-7`, 승인 설계·운영 SSOT |
```

In `docs/milestones.md`, record the same completed 07-19 decision and add
“live provider 연결 전 cache/lock/budget 테스트” to the implementation gate.

Update `README.md` with this repository map:

```markdown
## 모노레포

- `apps/web`: Next.js 웹과 Vercel API
- `apps/android`: Kotlin/Jetpack Compose 네이티브 앱
- `packages/contracts`: 웹·Android 공용 OpenAPI 계약
- `packages/llm`: Claude 서버 경계와 정적 폴백
- `infra/supabase`: PostgreSQL 마이그레이션과 테스트
```

Also change the AI description to:

```markdown
- AI: 백테스트로 고른 정량 추세 예측 + 서버가 허용한 행동만 설명하는 Claude Opus 4.7
  통제형 코치. Claude 장애·예산 초과 때도 정적 코치가 동작합니다.
```

- [ ] **Step 8: Synchronize commands, workflow triggers, environment, and prototype**

Replace the current stage in `docs/testing-and-feedback.md` with
`모노레포 부트스트랩` and list these exact commands:

```markdown
| 목적 | 명령 |
|---|---|
| 하네스 경로 | `pnpm harness:check` |
| 의존성 설치 | `pnpm install --frozen-lockfile` |
| 포맷 검사 | `pnpm format:check` |
| JS 린트 | `pnpm lint` |
| JS 타입 | `pnpm typecheck` |
| JS 테스트 | `pnpm test` |
| JS 빌드 | `pnpm build` |
| OpenAPI | `pnpm openapi:lint` |
| Supabase 시작·적용 | `pnpm supabase:start`, `pnpm supabase:reset` |
| Supabase 검사 | `pnpm supabase:lint`, `pnpm supabase:test` |
| Android 린트 | `.\apps\android\gradlew.bat -p .\apps\android :app:lintDebug` |
| Android 테스트 | `.\apps\android\gradlew.bat -p .\apps\android :app:testDebugUnitTest` |
| Android APK | `.\apps\android\gradlew.bat -p .\apps\android :app:assembleDebug` |
```

Add these documentation synchronization triggers to `docs/conventions.md`:

```markdown
| API 경로·필드·오류 변경 | packages/contracts/openapi.yaml + 웹·Android DTO/tests |
| LLM 모델·프롬프트·정책·비용 변경 | llm-coach.md + tech-stack.md + testing-and-feedback.md |
| DB 테이블·RLS·정책 변경 | architecture.md + infra/supabase tests |
| 모노레포 경로·루트 명령 변경 | AGENTS.md + architecture.md + testing-and-feedback.md |
```

Replace `.env.example` with:

```dotenv
# KRC public-data API (server only)
DATA_GO_KR_API_KEY=

# Ministry of the Interior and Safety road-name address API (server only)
JUSO_API_KEY=

# Supabase server access. Never expose the secret key to web or Android clients.
SUPABASE_URL=
SUPABASE_SECRET_KEY=

# Claude runtime. Safe defaults keep the public app on the static coach.
LLM_ENABLED=false
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-4-7
LLM_PROMPT_VERSION=coach-v1
LLM_ACTION_CATALOG_VERSION=actions-v1
LLM_TIMEOUT_MS=4000
LLM_MAX_TOKENS=256
LLM_DAILY_LIVE_MISS_LIMIT=20
LLM_CONTEST_BUDGET_USD=5
```

In `prototype/mulsigye-app-prototype-v2.html`:

- Replace every hard-coded `예측 오차(최근 14일) ±N.N%p` scenario string with
  `예측 오차는 백테스트 후 표시해요`.
- Replace the method sheet's hard-coded `±1.9%p` with
  `백테스트 완료 후 공개해요`.
- Replace the JavaScript assignment that extracts the hard-coded error with:

```js
$('#methodConf').textContent = '백테스트 완료 후 공개해요';
```

- [ ] **Step 9: Add CI for JavaScript, Android, Supabase, and docs**

Create `.github/workflows/verify.yml`:

```yaml
name: verify

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: verify-${{ github.ref }}
  cancel-in-progress: true

jobs:
  javascript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm harness:check
      - run: pnpm format:check
      - run: pnpm openapi:lint
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - shell: pwsh
        run: ./scripts/check-doc-links.ps1
      - run: node scripts/check-prototype.mjs

  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: 17
          cache: gradle
      - uses: android-actions/setup-android@v3
      - run: sdkmanager "platforms;android-36"
      - run: chmod +x apps/android/gradlew
      - run: ./apps/android/gradlew -p ./apps/android :app:lintDebug
      - run: ./apps/android/gradlew -p ./apps/android :app:testDebugUnitTest
      - run: ./apps/android/gradlew -p ./apps/android :app:assembleDebug

  supabase:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm supabase:start
      - run: pnpm supabase:reset
      - run: pnpm supabase:lint
      - run: pnpm supabase:test
      - if: always()
        run: pnpm supabase:stop
```

No CI job receives `ANTHROPIC_API_KEY` or a Claude Max OAuth credential.

- [ ] **Step 10: Run the complete verification matrix**

Run:

```powershell
pnpm install --frozen-lockfile
pnpm harness:check
pnpm exec prettier --write "apps/web/**/*.{ts,tsx,css,json,mjs}" "packages/**/*.{ts,json,yaml}" "*.{json,yaml,mjs}"
pnpm format:check
pnpm openapi:lint
pnpm lint
pnpm typecheck
pnpm test
pnpm build
./apps/android/gradlew.bat -p ./apps/android :app:lintDebug
./apps/android/gradlew.bat -p ./apps/android :app:testDebugUnitTest
./apps/android/gradlew.bat -p ./apps/android :app:assembleDebug
powershell -NoProfile -File scripts/check-doc-links.ps1
node scripts/check-prototype.mjs
git diff --check
git status --short
```

Expected:

- All executable local commands pass.
- If the local machine lacks Docker or Android SDK, the corresponding GitHub jobs must pass before the work is called complete.
- `git diff --check` prints nothing.
- `git status --short` contains only the intended monorepo, source, CI, and synchronized documentation files before commit.

- [ ] **Step 11: Commit, push, and update the existing PR**

```powershell
git add AGENTS.md README.md .env.example .github apps packages infra docs scripts prototype package.json pnpm-lock.yaml
git commit -m "docs: 모노레포 하네스 오케스트레이션 확정"
git push origin docs/llm-coach-design
```

Update the existing `main` target PR title to:

```text
feat: 물시계 모노레포와 첫 health 세로 조각 구성
```

Use this PR checklist:

```markdown
- [x] pnpm harness/format/openapi/lint/typecheck/test/build 통과
- [x] Android lintDebug/testDebugUnitTest/assembleDebug 통과
- [x] Supabase clean reset/lint/pgTAP 통과
- [x] 관련 SSOT와 path-local AGENTS.md 갱신
- [x] 웹·Android health 계약 일치
- [x] 로그인·WebView·직접 Supabase/Anthropic 클라이언트 없음
- [x] Claude Max OAuth 자격증명과 비밀값 없음
```

Do not merge or push directly to `main` in this task.

## Plan Self-Review

- [ ] **Spec coverage:** Confirm every locked repository path has a creating task, the health contract is consumed by both clients, LLM has a safe source package without an unsafe public route, Supabase has RLS/no public policy, and docs/CI are synchronized.
- [ ] **Placeholder scan:** Run the following and require zero matches:

```powershell
$plan = "docs/superpowers/plans/2026-07-19-mulsigye-monorepo-bootstrap.md"
$patterns = @("T" + "BD", "TO" + "DO", "implement " + "later", "fill in " + "details", "Similar to " + "Task")
Select-String -Path $plan -Pattern $patterns
```

- [ ] **Type consistency:** Confirm `schemaVersion/service/status/asOf/sources/stale` match OpenAPI, generated TypeScript, Next route, web UI fixture, Android DTO, repository test, and UI state. Confirm `CoachFactPacket`, `GeneratedCoachCopy`, and `CoachProvider.generate` names match every LLM file and test.
- [ ] **Path consistency:** Run:

```powershell
rg -n '`contracts/openapi.yaml`|`supabase/migrations/`|\.\\android\\gradlew|LLM_API_KEY' AGENTS.md README.md docs .env.example .gitignore
```

Expected: zero stale-path or stale-key matches; approved explanatory history under
`docs/superpowers/specs/` may retain its original wording.
