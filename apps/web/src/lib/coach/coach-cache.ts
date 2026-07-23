// CoachCache — 검증된 코치 응답의 조회·저장(서버 전용).
// 캐시 키는 비식별 사실 조합만으로 만든다(설계 spec 9절): sigunCode·지역명·정확한
// 수치·요청 시각은 키에서 제외한다. 상태·전망·행동 조합이 같으면 모든 지역이 같은
// 안전한 문구를 재사용한다. 컬럼명은 마이그레이션(20260719000100)을 따른다.
import { createHash } from "node:crypto";
import type { CoachFactPacket } from "@mulsigye/llm";

/** Supabase 조회 결과의 최소 표면(실 클라이언트·테스트 대역 공유). */
export type CoachQueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string; code?: string } | null;
  count: number | null;
};

/**
 * coach_cache·coach_generation_locks·llm_usage에 쓰는 최소 쿼리 빌더 표면.
 * supabase-js PostgrestFilterBuilder와 구조적으로 호환되며(체이너블 + thenable),
 * 실 클라이언트는 `as unknown as CoachSupabaseClient`로 좁힌다(TS2589 회피).
 */
export interface CoachQueryBuilder extends PromiseLike<CoachQueryResult> {
  select(
    columns?: string,
    options?: { count?: "exact"; head?: boolean },
  ): CoachQueryBuilder;
  insert(rows: Record<string, unknown>[]): CoachQueryBuilder;
  upsert(
    rows: Record<string, unknown>[],
    options?: { onConflict?: string },
  ): CoachQueryBuilder;
  update(patch: Record<string, unknown>): CoachQueryBuilder;
  delete(): CoachQueryBuilder;
  eq(column: string, value: string | number): CoachQueryBuilder;
  neq(column: string, value: string | number): CoachQueryBuilder;
  gte(column: string, value: string): CoachQueryBuilder;
  lt(column: string, value: string): CoachQueryBuilder;
  limit(count: number): CoachQueryBuilder;
}

export type CoachSupabaseClient = {
  from(table: string): CoachQueryBuilder;
};

/** 캐시 키·저장에 붙는 버전·제공자 메타(사실 패킷과 분리). */
export type CacheKeyMeta = {
  locale?: string;
  promptVersion: string;
  actionCatalogVersion: string;
  provider: string;
  model: string;
};

/** 캐시에 담는 검증 통과 코치 문구(제목은 서버 카탈로그 결합분). */
export type CachedCoachCopy = {
  headline: string;
  summary: string;
  actions: Array<{ id: string; title: string; reason: string }>;
};

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

/**
 * 설계 spec 9절 화이트리스트 필드만 정규화 연결 후 SHA-256 hex로 만든다.
 * facts에 sigunCode·수치 등 화이트리스트 밖 필드가 섞여 있어도 키에 반영되지 않는다
 * (아래에서 명시 필드만 읽는다). orderedActionIds는 행동 순서를 키에 반영한다.
 */
export function buildCacheKey(
  facts: CoachFactPacket,
  orderedActionIds: readonly string[],
  meta: CacheKeyMeta,
): string {
  const parts = [
    facts.factSchemaVersion,
    facts.officialStage,
    facts.season,
    facts.reachBucket,
    facts.trendBucket,
    String(facts.highWaterNotice),
    facts.officialOutlookCode ?? "",
    orderedActionIds.join(","),
    meta.locale ?? "ko",
    meta.promptVersion,
    meta.actionCatalogVersion,
    meta.provider,
    meta.model,
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * 유효한 캐시(만료 전 + validation_status='valid')만 반환한다. 없으면 null.
 * Supabase 오류는 throw한다 — 호출자가 정적 폴백으로 처리한다(Claude 미호출).
 */
export async function getCachedCoach(
  client: CoachSupabaseClient,
  cacheKey: string,
  now: Date,
): Promise<CachedCoachCopy | null> {
  const { data, error } = await client
    .from("coach_cache")
    .select("response_json,expires_at,validation_status")
    .eq("cache_key", cacheKey)
    .limit(1);
  if (error !== null) {
    throw new Error(`coach_cache 조회 실패: ${error.message}`);
  }
  const row = data?.[0];
  if (row === undefined) return null;
  if (row["validation_status"] !== "valid") return null;
  const expiresAt = row["expires_at"];
  if (typeof expiresAt !== "string") return null;
  if (Date.parse(expiresAt) <= now.getTime()) return null;
  const response = row["response_json"];
  if (response === null || typeof response !== "object") return null;
  return response as CachedCoachCopy;
}

/** 검증 통과 응답을 30일 TTL로 저장한다(upsert, cache_key 충돌 시 갱신). */
export async function putCachedCoach(
  client: CoachSupabaseClient,
  input: {
    cacheKey: string;
    copy: CachedCoachCopy;
    meta: CacheKeyMeta;
    factSchemaVersion: string;
    now: Date;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
    latencyMs?: number;
  },
): Promise<void> {
  const createdAt = input.now.toISOString();
  const expiresAt = new Date(input.now.getTime() + CACHE_TTL_MS).toISOString();
  const row: Record<string, unknown> = {
    cache_key: input.cacheKey,
    fact_schema_version: input.factSchemaVersion,
    prompt_version: input.meta.promptVersion,
    action_catalog_version: input.meta.actionCatalogVersion,
    provider: input.meta.provider,
    model: input.meta.model,
    response_json: input.copy,
    created_at: createdAt,
    expires_at: expiresAt,
    validation_status: "valid",
    generation_source: "anthropic_api",
  };
  if (input.inputTokens !== undefined) row["input_tokens"] = input.inputTokens;
  if (input.outputTokens !== undefined)
    row["output_tokens"] = input.outputTokens;
  if (input.estimatedCostUsd !== undefined)
    row["estimated_cost_usd"] = input.estimatedCostUsd;
  if (input.latencyMs !== undefined) row["latency_ms"] = input.latencyMs;

  const { error } = await client
    .from("coach_cache")
    .upsert([row], { onConflict: "cache_key" });
  if (error !== null) {
    throw new Error(`coach_cache 저장 실패: ${error.message}`);
  }
}
