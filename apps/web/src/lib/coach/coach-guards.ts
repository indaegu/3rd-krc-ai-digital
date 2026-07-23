// CoachGuards — KST 일일 live miss 한도·앱 레벨 2단계 예산·generation lock(서버 전용).
// 예산 원자성은 앱 레벨 2단계다(설계 spec 10절, 사용자 승인): 예약행을 먼저 insert하고
// (result_code='reserved', 건당 0.02) 누적 합계를 검사해 초과면 예약을 회수한다. 두 요청이
// 경계에서 겹칠 때 최악 초과는 약 0.04 USD로 승인된 허용치다. 동시 생성은 lock으로 1회로 제한한다.
// 컬럼명은 마이그레이션(20260719000100)을 따른다.
import { kstDateOf } from "./coach-context.ts";
import type { CoachSupabaseClient } from "./coach-cache.ts";

/** live miss 건당 선예약 금액(설계 spec 10절). */
export const LIVE_MISS_RESERVATION_USD = 0.02;
export const DEFAULT_DAILY_LIVE_MISS_LIMIT = 20;
export const DEFAULT_CONTEST_BUDGET_USD = 5;
/** generation lock TTL — 8초 timeout + 검증·저장 여유(설계 spec 대비 15초). */
export const LOCK_TTL_MS = 15_000;

/** UTC 시각 → 해당 KST 달력일의 시작(00:00 KST)을 UTC ISO로. */
function kstDayStartIso(now: Date): string {
  return new Date(`${kstDateOf(now)}T00:00:00+09:00`).toISOString();
}

/**
 * KST 오늘의 llm_usage 건수가 limit 이상이면 false(차단). Supabase 오류는 throw.
 * 카운트는 KST 자정 경계(UTC+9 고정 오프셋)로 occurred_at을 자른다.
 */
export async function checkDailyLiveMissLimit(
  client: CoachSupabaseClient,
  now: Date,
  limit: number,
): Promise<boolean> {
  const { count, error } = await client
    .from("llm_usage")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", kstDayStartIso(now));
  if (error !== null) {
    throw new Error(`llm_usage 카운트 실패: ${error.message}`);
  }
  return (count ?? 0) < limit;
}

export type ReserveResult =
  { allowed: true; reservationId: number } | { allowed: false };

/**
 * 예약행 insert(0.02 선예약) → 누적 estimated_cost_usd 합산 → 예산 초과면 예약 회수.
 * 누적 합계(예약 포함)가 budget을 "초과"할 때만 차단한다(같으면 허용). Supabase 오류는 throw.
 */
export async function reserveBudget(
  client: CoachSupabaseClient,
  input: {
    now: Date;
    budget: number;
    contextHash: string;
    provider: string;
    model: string;
  },
): Promise<ReserveResult> {
  const inserted = await client
    .from("llm_usage")
    .insert([
      {
        occurred_at: input.now.toISOString(),
        context_hash: input.contextHash,
        provider: input.provider,
        model: input.model,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: LIVE_MISS_RESERVATION_USD,
        latency_ms: 0,
        result_code: "reserved",
      },
    ])
    .select("id")
    .limit(1);
  if (inserted.error !== null) {
    throw new Error(`예산 예약 실패: ${inserted.error.message}`);
  }
  const reservationId = Number(inserted.data?.[0]?.["id"]);
  if (!Number.isFinite(reservationId)) {
    throw new Error("예산 예약 실패: 예약 ID 없음");
  }

  const summed = await client.from("llm_usage").select("estimated_cost_usd");
  if (summed.error !== null) {
    // 합산 실패 — 예약을 회수하고 오류를 올린다.
    await releaseReservation(client, reservationId);
    throw new Error(`예산 합산 실패: ${summed.error.message}`);
  }
  const total = (summed.data ?? []).reduce((sum, row) => {
    const value = Number(row["estimated_cost_usd"]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  if (total > input.budget) {
    await releaseReservation(client, reservationId);
    return { allowed: false };
  }
  return { allowed: true, reservationId };
}

/** 예약행을 실제 결과로 갱신한다(best-effort — 실패해도 응답에 영향 없음). */
export async function settleUsage(
  client: CoachSupabaseClient,
  reservationId: number,
  patch: {
    resultCode: string;
    estimatedCostUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
  },
): Promise<void> {
  const update: Record<string, unknown> = { result_code: patch.resultCode };
  if (patch.estimatedCostUsd !== undefined)
    update["estimated_cost_usd"] = patch.estimatedCostUsd;
  if (patch.inputTokens !== undefined)
    update["input_tokens"] = patch.inputTokens;
  if (patch.outputTokens !== undefined)
    update["output_tokens"] = patch.outputTokens;
  if (patch.latencyMs !== undefined) update["latency_ms"] = patch.latencyMs;
  try {
    await client.from("llm_usage").update(update).eq("id", reservationId);
  } catch {
    // 정산 실패는 응답에 영향을 주지 않는다.
  }
}

/** 호출하지 못한 예약을 회수한다(best-effort delete). */
export async function releaseReservation(
  client: CoachSupabaseClient,
  reservationId: number,
): Promise<void> {
  try {
    await client.from("llm_usage").delete().eq("id", reservationId);
  } catch {
    // 회수 실패는 응답에 영향을 주지 않는다.
  }
}

/**
 * 단일 생성 권한 claim. 빈 상태면 insert로 획득, 이미 있으면 만료(locked_until<now)
 * 조건부 update로 인수한다. 실 Supabase 오류(중복 아님)는 throw. 미획득은 acquired:false.
 */
export async function claimGenerationLock(
  client: CoachSupabaseClient,
  cacheKey: string,
  input: { now: Date; ttlMs?: number },
): Promise<{ acquired: boolean }> {
  const nowIso = input.now.toISOString();
  const lockedUntil = new Date(
    input.now.getTime() + (input.ttlMs ?? LOCK_TTL_MS),
  ).toISOString();

  const inserted = await client
    .from("coach_generation_locks")
    .insert([{ cache_key: cacheKey, locked_until: lockedUntil }]);
  if (inserted.error === null) {
    return { acquired: true };
  }

  // insert 충돌 — 만료된 lock이면 인수(조건부 update), 아니면 미획득.
  const takeover = await client
    .from("coach_generation_locks")
    .update({ locked_until: lockedUntil })
    .eq("cache_key", cacheKey)
    .lt("locked_until", nowIso)
    .select("cache_key");
  if (takeover.error !== null) {
    throw new Error(`generation lock 실패: ${takeover.error.message}`);
  }
  return { acquired: (takeover.data?.length ?? 0) > 0 };
}

/** lock 해제(best-effort delete). */
export async function releaseGenerationLock(
  client: CoachSupabaseClient,
  cacheKey: string,
): Promise<void> {
  try {
    await client
      .from("coach_generation_locks")
      .delete()
      .eq("cache_key", cacheKey);
  } catch {
    // 해제 실패해도 lock은 TTL로 만료된다.
  }
}
