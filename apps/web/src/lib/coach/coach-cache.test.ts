// coach-cache 테스트 — 캐시 키 안전성(비식별)·조회 유효성 게이트.
// 실 Supabase 미호출(인메모리 대역). SHA-256 hex 결정성과 필드 화이트리스트를 강제한다.
import type { CoachFactPacket } from "@mulsigye/llm";
import { describe, expect, it } from "vitest";
import {
  buildCacheKey,
  getCachedCoach,
  putCachedCoach,
  type CacheKeyMeta,
} from "./coach-cache.ts";
import { createFakeCoachSupabase } from "./coach-supabase-fake.ts";

const META: CacheKeyMeta = {
  promptVersion: "coach-v1",
  actionCatalogVersion: "actions-v1",
  provider: "anthropic",
  model: "claude-opus-4-7",
};

function facts(overrides: Partial<CoachFactPacket> = {}): CoachFactPacket {
  return {
    factSchemaVersion: "1",
    officialStage: "관심",
    season: "여름",
    reachBucket: "within_14d",
    trendBucket: "falling",
    highWaterNotice: false,
    officialOutlookCode: null,
    actions: [
      { id: "watch_check_leak", approvedTitle: "t1", approvedRationale: "r1" },
      {
        id: "watch_plan_watering",
        approvedTitle: "t2",
        approvedRationale: "r2",
      },
      {
        id: "watch_follow_trend",
        approvedTitle: "t3",
        approvedRationale: "r3",
      },
    ],
    ...overrides,
  };
}

const ORDERED_IDS = [
  "watch_check_leak",
  "watch_plan_watering",
  "watch_follow_trend",
];

describe("buildCacheKey", () => {
  it("SHA-256 64자리 hex를 만든다", () => {
    const key = buildCacheKey(facts(), ORDERED_IDS, META);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("같은 사실 조합이면 같은 키다(결정성)", () => {
    const a = buildCacheKey(facts(), ORDERED_IDS, META);
    const b = buildCacheKey(facts(), ORDERED_IDS, META);
    expect(a).toBe(b);
  });

  it("단계가 다르면 키가 달라진다", () => {
    const a = buildCacheKey(facts(), ORDERED_IDS, META);
    const b = buildCacheKey(
      facts({ officialStage: "심각" }),
      ORDERED_IDS,
      META,
    );
    expect(a).not.toBe(b);
  });

  it("sigunCode·지역명·수치·요청 시각을 facts에 주입해도 키가 바뀌지 않는다", () => {
    const clean = buildCacheKey(facts(), ORDERED_IDS, META);
    // 화이트리스트 밖 필드를 억지로 주입한다 — 키 계산은 이들을 무시해야 한다.
    const polluted = facts() as CoachFactPacket & Record<string, unknown>;
    polluted["sigunCode"] = "44230";
    polluted["regionName"] = "논산시";
    polluted["avgRatio"] = 57.3;
    polluted["rate"] = 84.1;
    polluted["requestedAt"] = "2026-07-23T05:00:00.000Z";
    const dirty = buildCacheKey(polluted, ORDERED_IDS, META);
    expect(dirty).toBe(clean);
  });

  it("행동 ID 순서가 바뀌면 키가 달라진다", () => {
    const a = buildCacheKey(facts(), ORDERED_IDS, META);
    const b = buildCacheKey(facts(), [...ORDERED_IDS].reverse(), META);
    expect(a).not.toBe(b);
  });

  it("promptVersion/model 등 버전이 바뀌면 키가 달라진다", () => {
    const a = buildCacheKey(facts(), ORDERED_IDS, META);
    const b = buildCacheKey(facts(), ORDERED_IDS, {
      ...META,
      promptVersion: "coach-v2",
    });
    expect(a).not.toBe(b);
  });
});

const NOW = new Date("2026-07-23T05:00:00.000Z");
const COPY = {
  headline: "우리 지역 물 흐름을 살펴봐요.",
  summary: "예측은 참고 정보예요. 공식 예·경보를 먼저 확인해요.",
  actions: [
    { id: "watch_check_leak", title: "t1", reason: "쉬운 이유1이에요." },
    { id: "watch_plan_watering", title: "t2", reason: "쉬운 이유2예요." },
    { id: "watch_follow_trend", title: "t3", reason: "쉬운 이유3이에요." },
  ],
};

describe("putCachedCoach / getCachedCoach", () => {
  it("저장한 응답을 같은 키로 되읽는다(30일 TTL)", async () => {
    const client = createFakeCoachSupabase();
    const key = buildCacheKey(facts(), ORDERED_IDS, META);
    await putCachedCoach(client, {
      cacheKey: key,
      copy: COPY,
      meta: META,
      factSchemaVersion: "1",
      now: NOW,
    });
    const row = (client.tables["coach_cache"] ?? [])[0];
    expect(row?.["cache_key"]).toBe(key);
    // 만료는 30일 뒤여야 한다.
    const expires = Date.parse(String(row?.["expires_at"]));
    const expected = NOW.getTime() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expires - expected)).toBeLessThan(1000);

    const got = await getCachedCoach(client, key, NOW);
    expect(got).toEqual(COPY);
  });

  it("만료된(expires_at 과거) 행은 반환하지 않는다", async () => {
    const client = createFakeCoachSupabase();
    const key = "expired-key";
    client.seed("coach_cache", [
      {
        cache_key: key,
        response_json: COPY,
        expires_at: "2026-07-01T00:00:00.000Z",
        validation_status: "valid",
      },
    ]);
    expect(await getCachedCoach(client, key, NOW)).toBeNull();
  });

  it("validation_status가 valid가 아니면 반환하지 않는다", async () => {
    const client = createFakeCoachSupabase();
    const key = "invalid-key";
    client.seed("coach_cache", [
      {
        cache_key: key,
        response_json: COPY,
        expires_at: "2026-12-01T00:00:00.000Z",
        validation_status: "invalid",
      },
    ]);
    expect(await getCachedCoach(client, key, NOW)).toBeNull();
  });

  it("없는 키는 null이다", async () => {
    const client = createFakeCoachSupabase();
    expect(await getCachedCoach(client, "missing", NOW)).toBeNull();
  });

  it("Supabase 오류는 throw한다(호출자가 정적 폴백으로 처리)", async () => {
    const client = createFakeCoachSupabase({ failing: true });
    await expect(getCachedCoach(client, "any", NOW)).rejects.toThrow();
  });
});
