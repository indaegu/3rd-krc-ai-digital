// /api/v1/coach 오케스트레이션 — 서버 전용. 정적 조립(기본) → LLM_ENABLED && 키 존재
// 시에만 live 파이프라인(설계 spec 6.1 순서). 어떤 실패 경로에서도 정적 코치 HTTP 200을
// 유지하고, 단계·수치·행동 ID·순서는 서버(카탈로그·CoachPolicy)가 확정한다(AGENTS 규칙 10).
// env·provider·Supabase 클라이언트는 deps.llm으로 주입 가능하며(기본은 process.env +
// supabase-server + AnthropicCoachProvider), 실패 경로는 spec 11절 표를 fallbackReason으로 매핑한다.
import type { CoachResponse } from "@mulsigye/contracts";
import {
  ACTION_CATALOG_VERSION,
  AnthropicCoachProvider,
  ANTHROPIC_MODEL,
  type CoachFactPacket,
  type CoachProvider,
  type GeneratedCoachCopy,
  PROMPT_VERSION,
  selectActions,
  StaticCoachProvider,
} from "@mulsigye/llm";
import { buildStatus, type StatusServiceDeps } from "../data/status-service.ts";
import { createServiceRoleClient } from "../data/supabase-server.ts";
import {
  buildForecast,
  type ForecastServiceDeps,
} from "../prediction/forecast-service.ts";
import {
  buildCacheKey,
  type CacheKeyMeta,
  type CachedCoachCopy,
  type CoachSupabaseClient,
  getCachedCoach,
  putCachedCoach,
} from "./coach-cache.ts";
import { buildCoachFactPacket } from "./coach-context.ts";
import {
  checkDailyLiveMissLimit,
  claimGenerationLock,
  DEFAULT_CONTEST_BUDGET_USD,
  DEFAULT_DAILY_LIVE_MISS_LIMIT,
  releaseGenerationLock,
  releaseReservation,
  reserveBudget,
  settleUsage,
} from "./coach-guards.ts";

/** live 분기·가드가 읽는 환경변수(기본은 process.env). */
export type CoachLlmEnv = {
  LLM_ENABLED?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
  LLM_DAILY_LIVE_MISS_LIMIT?: string | undefined;
  LLM_CONTEST_BUDGET_USD?: string | undefined;
};

export type CoachLlmDeps = {
  env?: CoachLlmEnv;
  /** Supabase service-role 클라이언트 팩토리(기본은 supabase-server). */
  createClient?: () => CoachSupabaseClient;
  /** 코치 provider(기본은 AnthropicCoachProvider — live일 때만 지연 생성). */
  provider?: CoachProvider;
};

export type CoachServiceDeps = {
  status?: StatusServiceDeps;
  forecast?: ForecastServiceDeps;
  now?: () => Date;
  llm?: CoachLlmDeps;
};

export type CoachResult =
  | { kind: "ok"; body: CoachResponse }
  | { kind: "not_prepared" }
  | { kind: "unavailable" };

type FallbackReason = CoachResponse["fallbackReason"];

/** 정적 provider 단일 인스턴스 — 폴백이 실행하는 CoachProvider다. */
const staticCoachProvider = new StaticCoachProvider();

const CACHE_META_PROVIDER = "anthropic";

/** 공개 응답 조립에 필요한 공통 필드(정적·캐시·live 공유). */
type CoachAssembly = {
  facts: CoachFactPacket;
  dataStale: boolean;
  sources: string[];
  now: () => Date;
};

/** 행동 title은 항상 서버 카탈로그에서 결합한다 — provider 산출물에는 title이 없다. */
function joinTitles(
  facts: CoachFactPacket,
  copyActions: ReadonlyArray<{ id: string; reason: string }>,
): Array<{ id: string; title: string; reason: string }> {
  const titleById = new Map(
    facts.actions.map((action) => [action.id, action.approvedTitle]),
  );
  return copyActions.map(({ id, reason }) => {
    const title = titleById.get(id);
    if (title === undefined) {
      throw new Error(`행동 카탈로그에 없는 ID: ${id}`);
    }
    return { id, title, reason };
  });
}

function assembleResponse(
  assembly: CoachAssembly,
  input: {
    mode: CoachResponse["mode"];
    cacheHit: boolean;
    fallbackReason: FallbackReason;
    coach: CoachResponse["coach"];
  },
): CoachResponse {
  const generatedAt = assembly.now().toISOString();
  return {
    schemaVersion: "1",
    mode: input.mode,
    dataStale: assembly.dataStale,
    cacheHit: input.cacheHit,
    generatedAt,
    promptVersion: PROMPT_VERSION,
    actionCatalogVersion: ACTION_CATALOG_VERSION,
    coach: input.coach,
    fallbackReason: input.fallbackReason,
    asOf: generatedAt,
    sources: assembly.sources,
    stale: assembly.dataStale,
  };
}

/** 정적 코치 본문 — 모든 폴백 경로가 공유한다(fallbackReason만 다르다). */
async function buildStaticBody(
  assembly: CoachAssembly,
  fallbackReason: FallbackReason,
): Promise<CoachResponse> {
  const copy = await staticCoachProvider.generate(assembly.facts);
  return assembleResponse(assembly, {
    mode: "static",
    cacheHit: false,
    fallbackReason,
    coach: {
      headline: copy.headline,
      summary: copy.summary,
      actions: joinTitles(assembly.facts, copy.actions),
    },
  });
}

/** 캐시된 검증 통과 문구를 그대로 옮긴다(title은 저장 시점 카탈로그 결합분). */
function buildCacheBody(
  assembly: CoachAssembly,
  cached: CachedCoachCopy,
): CoachResponse {
  return assembleResponse(assembly, {
    mode: "cache",
    cacheHit: true,
    fallbackReason: null,
    coach: {
      headline: cached.headline,
      summary: cached.summary,
      actions: cached.actions.map(({ id, title, reason }) => ({
        id,
        title,
        reason,
      })),
    },
  });
}

type ProviderFallbackReason = Exclude<FallbackReason, null>;

/** provider 예외 → spec 11절 fallbackReason. 로그·payload에 상세를 남기지 않는다. */
function classifyProviderError(error: unknown): ProviderFallbackReason {
  if (error !== null && typeof error === "object") {
    const e = error as { name?: unknown; status?: unknown; message?: unknown };
    const name = typeof e.name === "string" ? e.name : "";
    const message = typeof e.message === "string" ? e.message : "";
    if (/timeout/i.test(name) || /timeout/i.test(message)) return "timeout";
    if (e.status === 429 || /RateLimit/i.test(name)) return "rate_limited";
    if (message === "PROVIDER_REFUSAL") return "refusal";
    if (message === "PROVIDER_MAX_TOKENS") return "max_tokens";
    if (
      name === "ZodError" ||
      message === "ACTION_IDS_MISMATCH" ||
      message === "FORBIDDEN_ASSERTION"
    ) {
      return "validation_failed";
    }
  }
  return "provider_error";
}

function readEnv(deps: CoachServiceDeps): CoachLlmEnv {
  return (
    deps.llm?.env ?? {
      LLM_ENABLED: process.env["LLM_ENABLED"],
      ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
      ANTHROPIC_MODEL: process.env["ANTHROPIC_MODEL"],
      LLM_DAILY_LIVE_MISS_LIMIT: process.env["LLM_DAILY_LIVE_MISS_LIMIT"],
      LLM_CONTEST_BUDGET_USD: process.env["LLM_CONTEST_BUDGET_USD"],
    }
  );
}

function parsePositive(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * live 파이프라인(설계 spec 6.1). 어떤 Supabase 장애·한도·예산·provider 실패도
 * 정적 코치 CoachResponse로 종료한다(Claude 추가 호출 없음). 성공 시 mode "llm".
 */
async function runLivePipeline(
  assembly: CoachAssembly,
  env: CoachLlmEnv,
  llm: CoachLlmDeps,
): Promise<CoachResponse> {
  const now = assembly.now();
  const model = env.ANTHROPIC_MODEL ?? ANTHROPIC_MODEL;
  const meta: CacheKeyMeta = {
    promptVersion: PROMPT_VERSION,
    actionCatalogVersion: ACTION_CATALOG_VERSION,
    provider: CACHE_META_PROVIDER,
    model,
  };
  const orderedActionIds = assembly.facts.actions.map((action) => action.id);
  const cacheKey = buildCacheKey(assembly.facts, orderedActionIds, meta);

  // Supabase 클라이언트 생성 실패는 즉시 정적(Claude 미호출).
  let client: CoachSupabaseClient;
  try {
    client = (llm.createClient ?? defaultCreateClient)();
  } catch {
    return buildStaticBody(assembly, "cache_unavailable");
  }

  const dailyLimit = parsePositive(
    env.LLM_DAILY_LIVE_MISS_LIMIT,
    DEFAULT_DAILY_LIVE_MISS_LIMIT,
  );
  const budget = parsePositive(
    env.LLM_CONTEST_BUDGET_USD,
    DEFAULT_CONTEST_BUDGET_USD,
  );

  // 1) 캐시 조회 → hit이면 mode "cache". 2) 일일 한도. (Supabase 오류는 cache_unavailable.)
  let reservationId: number | null = null;
  try {
    const cached = await getCachedCoach(client, cacheKey, now);
    if (cached !== null) {
      return buildCacheBody(assembly, cached);
    }
    const withinDaily = await checkDailyLiveMissLimit(client, now, dailyLimit);
    if (!withinDaily) {
      return buildStaticBody(assembly, "daily_limit");
    }
    // 3) 예산 선예약(0.02) — 초과면 정적.
    const reservation = await reserveBudget(client, {
      now,
      budget,
      contextHash: cacheKey,
      provider: CACHE_META_PROVIDER,
      model,
    });
    if (!reservation.allowed) {
      return buildStaticBody(assembly, "budget_exceeded");
    }
    reservationId = reservation.reservationId;

    // 4) 단일 생성 권한 — 미획득이면 캐시 한 번 더 읽고 정적(추가 호출 없음).
    const lock = await claimGenerationLock(client, cacheKey, { now });
    if (!lock.acquired) {
      await releaseReservation(client, reservationId);
      reservationId = null;
      const retry = await getCachedCoach(client, cacheKey, now);
      if (retry !== null) {
        return buildCacheBody(assembly, retry);
      }
      return buildStaticBody(assembly, "generation_in_progress");
    }
  } catch {
    // getCachedCoach·한도·예약·lock 어느 단계든 Supabase 장애 → 정적, Claude 미호출.
    if (reservationId !== null) {
      await releaseReservation(client, reservationId);
    }
    return buildStaticBody(assembly, "cache_unavailable");
  }

  // 여기 도달했으면 lock을 보유했고 예약이 유효하다(방어적 좁힘).
  const heldReservation = reservationId;
  if (heldReservation === null) {
    return buildStaticBody(assembly, "cache_unavailable");
  }

  // 5) lock 보유 — Claude를 한 번 호출한다(provider가 timeout·재시도0을 소유).
  const startedAt = now.getTime();
  try {
    const provider = llm.provider ?? defaultProvider(env);
    const copy: GeneratedCoachCopy = await provider.generate(assembly.facts);
    const actions = joinTitles(assembly.facts, copy.actions);
    const cachedCopy: CachedCoachCopy = {
      headline: copy.headline,
      summary: copy.summary,
      actions,
    };
    // 6) 검증 통과분만 저장(저장 실패는 비치명 — live 응답은 그대로 반환).
    try {
      await putCachedCoach(client, {
        cacheKey,
        copy: cachedCopy,
        meta,
        factSchemaVersion: assembly.facts.factSchemaVersion,
        now,
        latencyMs: assembly.now().getTime() - startedAt,
      });
    } catch {
      // 캐시 저장 실패는 응답에 영향을 주지 않는다.
    }
    await settleUsage(client, heldReservation, {
      resultCode: "success",
      latencyMs: assembly.now().getTime() - startedAt,
    });
    return assembleResponse(assembly, {
      mode: "llm",
      cacheHit: false,
      fallbackReason: null,
      coach: cachedCopy,
    });
  } catch (error) {
    const reason = classifyProviderError(error);
    // 호출은 이뤄졌으므로 예약은 회수하지 않고 실제 결과로 정산한다(보수적 비용 기록).
    await settleUsage(client, heldReservation, { resultCode: reason });
    return buildStaticBody(assembly, reason);
  } finally {
    await releaseGenerationLock(client, cacheKey);
  }
}

function defaultCreateClient(): CoachSupabaseClient {
  // supabase-js 제네릭 빌더를 구조 비교하면 TS2589가 나므로 unknown 경유로 좁힌다
  // (status-service와 동일 사유 — 형태는 CoachSupabaseClient 계약과 테스트가 강제).
  return createServiceRoleClient() as unknown as CoachSupabaseClient;
}

/** live일 때만 지연 생성 — 비활성/키 없음 경로에서는 SDK를 아예 구성하지 않는다. */
function defaultProvider(env: CoachLlmEnv): CoachProvider {
  // liveEnabled 게이트가 ANTHROPIC_API_KEY 존재를 이미 보장하지만, 타입상 좁혀 전달한다.
  return new AnthropicCoachProvider(
    env.ANTHROPIC_API_KEY !== undefined
      ? { apiKey: env.ANTHROPIC_API_KEY }
      : {},
  );
}

/**
 * sigunCode 하나로 status·forecast를 조립해 코치 CoachResponse를 만든다.
 * 기본은 정적 코치이며, LLM_ENABLED === "true" && ANTHROPIC_API_KEY 존재 시에만 live.
 * HTTP 매핑은 라우트가 맡는다(ok / not_prepared / unavailable).
 */
export async function buildCoach(
  sigunCode: string,
  deps: CoachServiceDeps = {},
): Promise<CoachResult> {
  const now = deps.now ?? (() => new Date());
  // 하위 서비스 deps에 now가 없으면 코치의 now를 물려준다(동일 기준시각).
  const [statusResult, forecastResult] = await Promise.all([
    buildStatus(sigunCode, { now, ...(deps.status ?? {}) }),
    buildForecast(sigunCode, { now, ...(deps.forecast ?? {}) }),
  ]);

  if (
    statusResult.kind === "not_prepared" ||
    forecastResult.kind === "not_prepared"
  ) {
    return { kind: "not_prepared" };
  }
  // 패킷은 단계(status)와 버킷(forecast)을 모두 요구한다 — 한쪽만 죽어도 조립 불가.
  if (statusResult.kind !== "ok" || forecastResult.kind !== "ok") {
    return { kind: "unavailable" };
  }
  const status = statusResult.body;
  const forecast = forecastResult.body;

  // 만수위 참고는 status가 서버에서 확정한 highWaterNotice를 그대로 쓴다 —
  // 수위 시계열을 다시 조회하거나 재판정하지 않는다(판정 위치는 status 하나).
  const base = buildCoachFactPacket({ status, forecast, now: now() });
  const facts: CoachFactPacket = {
    ...base,
    actions: selectActions(base.officialStage, base.highWaterNotice),
  };

  const dataStale = status.stale || forecast.stale;
  const assembly: CoachAssembly = {
    facts,
    dataStale,
    sources: [...new Set([...status.sources, ...forecast.sources])],
    now,
  };

  const env = readEnv(deps);
  const liveEnabled =
    env.LLM_ENABLED === "true" &&
    typeof env.ANTHROPIC_API_KEY === "string" &&
    env.ANTHROPIC_API_KEY.length > 0;

  if (!liveEnabled) {
    // 비활성·키 없음 — 정적 코치 200(fallbackReason "disabled"). Claude 미구성.
    return { kind: "ok", body: await buildStaticBody(assembly, "disabled") };
  }

  const body = await runLivePipeline(assembly, env, deps.llm ?? {});
  return { kind: "ok", body };
}
