// coach-guards 테스트 — KST 일일 한도·앱 레벨 2단계 예산·generation lock.
// 실 Supabase 미호출(인메모리 대역). 예산 원자성은 예약행 insert → 합산 → 초과 시 회수.
import { describe, expect, it } from "vitest";
import {
  checkDailyLiveMissLimit,
  claimGenerationLock,
  LIVE_MISS_RESERVATION_USD,
  releaseGenerationLock,
  releaseReservation,
  reserveBudget,
  settleUsage,
} from "./coach-guards.ts";
import { createFakeCoachSupabase } from "./coach-supabase-fake.ts";

const NOW = new Date("2026-07-23T05:00:00.000Z"); // KST 2026-07-23 14:00
const KEY = "cache-key-abc";
const RESERVE_META = {
  contextHash: KEY,
  provider: "anthropic",
  model: "claude-opus-4-7",
};

function usageRow(occurredAt: string, cost: number): Record<string, unknown> {
  return {
    occurred_at: occurredAt,
    context_hash: "ctx",
    provider: "anthropic",
    model: "claude-opus-4-7",
    input_tokens: 900,
    output_tokens: 200,
    estimated_cost_usd: cost,
    latency_ms: 4400,
    result_code: "success",
  };
}

describe("checkDailyLiveMissLimit — KST 달력일", () => {
  it("KST 오늘 20건 이상이면 차단한다", async () => {
    const client = createFakeCoachSupabase();
    const rows = Array.from({ length: 20 }, (_, k) =>
      usageRow(`2026-07-23T0${String(k % 6)}:30:00.000Z`, 0.01),
    );
    client.seed("llm_usage", rows);
    expect(await checkDailyLiveMissLimit(client, NOW, 20)).toBe(false);
  });

  it("KST 오늘 19건이면 허용한다", async () => {
    const client = createFakeCoachSupabase();
    const rows = Array.from({ length: 19 }, (_, k) =>
      usageRow(`2026-07-23T0${String(k % 6)}:30:00.000Z`, 0.01),
    );
    client.seed("llm_usage", rows);
    expect(await checkDailyLiveMissLimit(client, NOW, 20)).toBe(true);
  });

  it("어제 KST(자정 경계 이전) 건은 오늘 카운트에서 제외한다", async () => {
    const client = createFakeCoachSupabase();
    // KST 2026-07-23 00:00 == UTC 2026-07-22T15:00. 그 이전은 어제다.
    const yesterday = Array.from({ length: 30 }, () =>
      usageRow("2026-07-22T14:59:00.000Z", 0.01),
    );
    client.seed("llm_usage", yesterday);
    expect(await checkDailyLiveMissLimit(client, NOW, 20)).toBe(true);
  });

  it("Supabase 오류는 throw한다", async () => {
    const client = createFakeCoachSupabase({ failing: true });
    await expect(checkDailyLiveMissLimit(client, NOW, 20)).rejects.toThrow();
  });
});

describe("reserveBudget — 앱 레벨 2단계", () => {
  it("여유가 있으면 예약행을 남기고 허용한다", async () => {
    const client = createFakeCoachSupabase();
    const result = await reserveBudget(client, {
      now: NOW,
      budget: 5,
      ...RESERVE_META,
    });
    expect(result.allowed).toBe(true);
    const usage = client.tables["llm_usage"] ?? [];
    expect(usage).toHaveLength(1);
    expect(usage[0]?.["result_code"]).toBe("reserved");
    expect(usage[0]?.["estimated_cost_usd"]).toBe(LIVE_MISS_RESERVATION_USD);
  });

  it("예약 후 총액이 예산을 넘으면 차단하고 예약을 회수한다", async () => {
    const client = createFakeCoachSupabase();
    // 누적 4.99 + 예약 0.02 = 5.01 > 5 → 차단.
    client.seed("llm_usage", [usageRow("2026-07-23T01:00:00.000Z", 4.99)]);
    const result = await reserveBudget(client, {
      now: NOW,
      budget: 5,
      ...RESERVE_META,
    });
    expect(result.allowed).toBe(false);
    // 예약행이 삭제되어 기존 1건만 남는다.
    expect(client.tables["llm_usage"]).toHaveLength(1);
    expect((client.tables["llm_usage"] ?? [])[0]?.["estimated_cost_usd"]).toBe(
      4.99,
    );
  });

  it("예약 후 총액이 예산과 같으면(초과 아님) 허용한다", async () => {
    const client = createFakeCoachSupabase();
    // 누적 4.98 + 예약 0.02 = 5.00, 초과 아님 → 허용.
    client.seed("llm_usage", [usageRow("2026-07-23T01:00:00.000Z", 4.98)]);
    const result = await reserveBudget(client, {
      now: NOW,
      budget: 5,
      ...RESERVE_META,
    });
    expect(result.allowed).toBe(true);
    expect(client.tables["llm_usage"]).toHaveLength(2);
  });
});

describe("settleUsage / releaseReservation", () => {
  it("settleUsage는 예약행을 실제 결과로 갱신한다", async () => {
    const client = createFakeCoachSupabase();
    const result = await reserveBudget(client, {
      now: NOW,
      budget: 5,
      ...RESERVE_META,
    });
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    await settleUsage(client, result.reservationId, {
      resultCode: "success",
      estimatedCostUsd: 0.011,
      inputTokens: 880,
      outputTokens: 190,
      latencyMs: 4400,
    });
    const row = (client.tables["llm_usage"] ?? [])[0];
    expect(row?.["result_code"]).toBe("success");
    expect(row?.["estimated_cost_usd"]).toBe(0.011);
    expect(row?.["latency_ms"]).toBe(4400);
  });

  it("releaseReservation은 예약행을 제거한다", async () => {
    const client = createFakeCoachSupabase();
    const result = await reserveBudget(client, {
      now: NOW,
      budget: 5,
      ...RESERVE_META,
    });
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    await releaseReservation(client, result.reservationId);
    expect(client.tables["llm_usage"] ?? []).toHaveLength(0);
  });
});

describe("claimGenerationLock / releaseGenerationLock", () => {
  it("빈 상태면 lock을 획득한다", async () => {
    const client = createFakeCoachSupabase();
    const r = await claimGenerationLock(client, KEY, { now: NOW });
    expect(r.acquired).toBe(true);
    expect(client.tables["coach_generation_locks"]).toHaveLength(1);
  });

  it("만료되지 않은 lock이 있으면 획득하지 못한다", async () => {
    const client = createFakeCoachSupabase();
    await claimGenerationLock(client, KEY, { now: NOW });
    const second = await claimGenerationLock(client, KEY, { now: NOW });
    expect(second.acquired).toBe(false);
  });

  it("locked_until이 지난 lock은 인수해 획득한다", async () => {
    const client = createFakeCoachSupabase();
    client.seed("coach_generation_locks", [
      { cache_key: KEY, locked_until: "2026-07-23T04:00:00.000Z" },
    ]);
    // NOW(05:00) > locked_until(04:00) → 만료 → 인수.
    const r = await claimGenerationLock(client, KEY, { now: NOW });
    expect(r.acquired).toBe(true);
  });

  it("releaseGenerationLock은 lock을 제거한다", async () => {
    const client = createFakeCoachSupabase();
    await claimGenerationLock(client, KEY, { now: NOW });
    await releaseGenerationLock(client, KEY);
    expect(client.tables["coach_generation_locks"] ?? []).toHaveLength(0);
  });

  it("Supabase 오류는 throw한다", async () => {
    const client = createFakeCoachSupabase({ failing: true });
    await expect(
      claimGenerationLock(client, KEY, { now: NOW }),
    ).rejects.toThrow();
  });
});
