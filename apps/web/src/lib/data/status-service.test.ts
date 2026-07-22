// status-service 폴백 오케스트레이션 테스트 — 전부 mock, 실 KRC 키 호출 금지.
// ① 수위 API → ② Supabase 최신 관측 → ③ 커밋 스냅샷 순서와 stale·sources·단계 경계를 강제한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegionResolverDeps, ReservoirsClient } from "./region-resolver";
import {
  buildStatus,
  DROUGHT_MAP_SOURCE,
  SUPABASE_SNAPSHOT_SOURCE,
  WATERLEVEL_API_SOURCE,
  type StatusServiceDeps,
  type StatusSupabaseClient,
} from "./status-service";
import type { WaterLevelFetch } from "./waterlevel-api";

const sampleXml = readFileSync(
  join(process.cwd(), "test", "fixtures", "krc-waterlevel-sample.xml"),
  "utf8",
);

const RAW_KEY = "stage2+secret/key==";
const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");
const NONSAN = "44230";
const TAPJEONG = "4423010045";

const ERROR_XML =
  "<response><header><returnAuthMsg>SERVICE KEY IS NOT REGISTERED ERROR</returnAuthMsg>" +
  "<returnReasonCode>30</returnReasonCode></header></response>";

function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { "content-type": "application/xml" },
  });
}

const okFetch: WaterLevelFetch = async () => xmlResponse(sampleXml);
const http500Fetch: WaterLevelFetch = async () =>
  xmlResponse("server error", 500);
const badCodeFetch: WaterLevelFetch = async () => xmlResponse(ERROR_XML);
const timeoutFetch: WaterLevelFetch = async () => {
  throw new DOMException("The operation timed out.", "TimeoutError");
};

type QueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

type UpsertCall = {
  table: string;
  rows: Record<string, unknown>[];
  onConflict: string;
};

function makeStatusClient(config: {
  observations?: QueryResult;
  regional?: QueryResult;
  upsertError?: { message: string } | null;
  upsertRejects?: boolean;
}): { client: StatusSupabaseClient; upsertCalls: UpsertCall[] } {
  const upsertCalls: UpsertCall[] = [];
  const client: StatusSupabaseClient = {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      const result =
                        table === "reservoir_observations"
                          ? (config.observations ?? { data: [], error: null })
                          : (config.regional ?? { data: [], error: null });
                      return Promise.resolve(result);
                    },
                  };
                },
              };
            },
          };
        },
        upsert(rows, options) {
          upsertCalls.push({ table, rows, onConflict: options.onConflict });
          if (config.upsertRejects === true) {
            return Promise.reject(new Error("upsert unavailable"));
          }
          return Promise.resolve({ error: config.upsertError ?? null });
        },
      };
    },
  };
  return { client, upsertCalls };
}

/** 논산 44230 → 탑정을 결정하는 정상 resolver mock(Supabase reservoirs 조회 성공). */
const workingResolver: RegionResolverDeps = {
  createClient: (): ReservoirsClient => ({
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              { fac_code: TAPJEONG, name: "탑정", beneficiary_area: 5713 },
            ],
            error: null,
          }),
      }),
    }),
  }),
};

const REGIONAL_ROW = {
  observed_on: "2026-07-20",
  regional_rate: 55.1,
  normal_rate: 80,
  avg_ratio: 112.7,
  official_stage: "정상",
};

const OBSERVATION_ROW = {
  observed_on: "2026-07-19",
  rate: 58.4,
  water_level: 27.32,
};

function makeDeps(
  fetchImpl: WaterLevelFetch,
  client: StatusSupabaseClient,
  overrides: Partial<StatusServiceDeps> = {},
): StatusServiceDeps {
  return {
    waterLevel: { fetchImpl, apiKey: RAW_KEY, now: () => FIXED_NOW },
    createClient: () => client,
    resolver: workingResolver,
    now: () => FIXED_NOW,
    ...overrides,
  };
}

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  consoleSpies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildStatus — ① 수위 API 성공 경로", () => {
  it("최신 관측을 반환하고 stale=false, sources에 수위 API·논가뭄지도를 담는다", async () => {
    const { client } = makeStatusClient({
      regional: { data: [REGIONAL_ROW], error: null },
    });
    const result = await buildStatus(NONSAN, makeDeps(okFetch, client));

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("ok여야 한다");
    const { body } = result;
    expect(body.schemaVersion).toBe("1");
    expect(body.sigunCode).toBe(NONSAN);
    expect(body.sigunName).toBe("논산시");
    expect(body.reservoir).toEqual({
      facCode: TAPJEONG,
      name: "탑정",
      rate: 60.4,
      waterLevel: 27.48,
      observedOn: "2026-07-20",
    });
    expect(body.region.observedOn).toBe("2026-07-20");
    expect(body.region.officialStage).toEqual({ code: "ok", label: "정상" });
    expect(body.stale).toBe(false);
    expect(body.sources).toContain(WATERLEVEL_API_SOURCE);
    expect(body.sources).toContain(DROUGHT_MAP_SOURCE);
  });

  it("rate(원저수율)와 avgRatio(평년 대비)는 서로 다른 필드로 유지된다 — 혼용 금지", async () => {
    const { client } = makeStatusClient({
      regional: { data: [REGIONAL_ROW], error: null },
    });
    const result = await buildStatus(NONSAN, makeDeps(okFetch, client));

    if (result.kind !== "ok") throw new Error("ok여야 한다");
    // 원저수율 60.4(수위 API)와 평년 대비 112.7(논가뭄지도)이 각자의 필드에 남는다.
    expect(result.body.reservoir.rate).toBe(60.4);
    expect(result.body.region.avgRatio).toBe(112.7);
    expect(result.body.region.regionalRate).toBe(55.1);
    expect(result.body.reservoir.rate).not.toBe(result.body.region.avgRatio);
  });

  it("정상 응답이면 reservoir_observations에 source='waterlevel_api'로 upsert한다", async () => {
    const { client, upsertCalls } = makeStatusClient({
      regional: { data: [REGIONAL_ROW], error: null },
    });
    await buildStatus(NONSAN, makeDeps(okFetch, client));

    expect(upsertCalls).toHaveLength(1);
    const call = upsertCalls[0];
    expect(call?.table).toBe("reservoir_observations");
    expect(call?.onConflict).toBe("fac_code,observed_on");
    expect(call?.rows).toHaveLength(7);
    expect(call?.rows.every((row) => row["source"] === "waterlevel_api")).toBe(
      true,
    );
    expect(call?.rows).toContainEqual({
      fac_code: TAPJEONG,
      observed_on: "2026-07-20",
      rate: 60.4,
      water_level: 27.48,
      source: "waterlevel_api",
    });
  });

  it("upsert가 error를 돌려줘도, reject해도 응답은 ok를 유지한다(fire-and-forget)", async () => {
    const withError = makeStatusClient({
      regional: { data: [REGIONAL_ROW], error: null },
      upsertError: { message: "duplicate key" },
    });
    const errorResult = await buildStatus(
      NONSAN,
      makeDeps(okFetch, withError.client),
    );
    expect(errorResult.kind).toBe("ok");

    const withReject = makeStatusClient({
      regional: { data: [REGIONAL_ROW], error: null },
      upsertRejects: true,
    });
    const rejectResult = await buildStatus(
      NONSAN,
      makeDeps(okFetch, withReject.client),
    );
    expect(rejectResult.kind).toBe("ok");
    expect(withReject.upsertCalls).toHaveLength(1);
  });

  it("API 키가 어떤 콘솔 로그에도 노출되지 않는다", async () => {
    const { client } = makeStatusClient({
      regional: { data: [REGIONAL_ROW], error: null },
    });
    await buildStatus(NONSAN, makeDeps(okFetch, client));
    await buildStatus(NONSAN, makeDeps(timeoutFetch, client));

    const logText = JSON.stringify(
      consoleSpies.flatMap((spy) => spy.mock.calls),
    );
    expect(logText).not.toContain(RAW_KEY);
    expect(logText).not.toContain(encodeURIComponent(RAW_KEY));
  });
});

describe("buildStatus — ② API 장애 시 Supabase 최신 관측 폴백", () => {
  const failures: [string, WaterLevelFetch][] = [
    ["HTTP 500", http500Fetch],
    ['returnReasonCode !== "00"', badCodeFetch],
    ["timeout", timeoutFetch],
  ];

  it.each(failures)(
    "%s → Supabase 최신 관측으로 stale=true, upsert는 없다",
    async (_label, fetchImpl) => {
      const { client, upsertCalls } = makeStatusClient({
        observations: { data: [OBSERVATION_ROW], error: null },
        regional: { data: [REGIONAL_ROW], error: null },
      });
      const result = await buildStatus(NONSAN, makeDeps(fetchImpl, client));

      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") throw new Error("ok여야 한다");
      expect(result.body.reservoir).toEqual({
        facCode: TAPJEONG,
        name: "탑정",
        rate: 58.4,
        waterLevel: 27.32,
        observedOn: "2026-07-19",
      });
      expect(result.body.stale).toBe(true);
      expect(result.body.sources).toContain(SUPABASE_SNAPSHOT_SOURCE);
      expect(upsertCalls).toHaveLength(0);
    },
  );
});

describe("buildStatus — ③ Supabase도 장애면 커밋 스냅샷 폴백", () => {
  const downClient = makeStatusClient({
    observations: { data: null, error: { message: "connection refused" } },
    regional: { data: null, error: { message: "connection refused" } },
  }).client;

  it("커밋 스냅샷 관측으로 stale=true를 유지하고 sources에 스냅샷 기준일을 명시한다", async () => {
    const result = await buildStatus(
      NONSAN,
      makeDeps(timeoutFetch, downClient),
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("ok여야 한다");
    // 커밋 스냅샷 실측: 탑정 대표지 최근 30일의 마지막 관측은 2025-12-31 rate 91.
    expect(result.body.reservoir).toEqual({
      facCode: TAPJEONG,
      name: "탑정",
      rate: 91,
      waterLevel: null,
      observedOn: "2025-12-31",
    });
    // 지역 단계도 스냅샷 폴백: 44230 최신 행 2025-12-31 avgRatio 112.7 정상.
    expect(result.body.region.observedOn).toBe("2025-12-31");
    expect(result.body.region.avgRatio).toBe(112.7);
    expect(result.body.region.officialStage).toEqual({
      code: "ok",
      label: "정상",
    });
    expect(result.body.stale).toBe(true);
    expect(
      result.body.sources.some((source) =>
        /^커밋 스냅샷\(기준 2025-12-31\)$/.test(source),
      ),
    ).toBe(true);
  });

  it("API·Supabase·스냅샷 셋 다 관측이 없으면 unavailable", async () => {
    const result = await buildStatus(
      NONSAN,
      makeDeps(timeoutFetch, downClient, {
        snapshotObservations: {
          latestByFacility: [],
          representativeRecent30d: {},
        },
      }),
    );
    expect(result.kind).toBe("unavailable");
  });

  it("지역 단계가 Supabase·스냅샷 어디에도 없으면 unavailable", async () => {
    const { client } = makeStatusClient({
      observations: { data: [OBSERVATION_ROW], error: null },
      regional: { data: null, error: { message: "connection refused" } },
    });
    const result = await buildStatus(
      NONSAN,
      makeDeps(timeoutFetch, client, { snapshotRegional: [] }),
    );
    expect(result.kind).toBe("unavailable");
  });
});

describe("buildStatus — 지역 단계 소스·경계", () => {
  it("regional_drought_daily 조회 실패 시 스냅샷 지역 행으로 폴백하고 stale=true", async () => {
    const { client } = makeStatusClient({
      regional: { data: null, error: { message: "connection refused" } },
    });
    const result = await buildStatus(NONSAN, makeDeps(okFetch, client));

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("ok여야 한다");
    expect(result.body.region.observedOn).toBe("2025-12-31");
    expect(result.body.stale).toBe(true);
    expect(result.body.sources).toContain(DROUGHT_MAP_SOURCE);
  });

  it("원천 officialStage 라벨이 있으면 계산값보다 원천을 우선한다", async () => {
    // avgRatio 65는 계산상 '관심'이지만 원천 라벨 '주의'가 이긴다.
    const { client } = makeStatusClient({
      regional: {
        data: [{ ...REGIONAL_ROW, avg_ratio: 65, official_stage: "주의" }],
        error: null,
      },
    });
    const result = await buildStatus(NONSAN, makeDeps(okFetch, client));

    if (result.kind !== "ok") throw new Error("ok여야 한다");
    expect(result.body.region.officialStage).toEqual({
      code: "care",
      label: "주의",
    });
  });

  const boundaries: [number, string, string][] = [
    [70, "watch", "관심"],
    [70.1, "ok", "정상"],
    [60, "care", "주의"],
    [60.1, "watch", "관심"],
    [50, "alert", "경계"],
    [50.1, "care", "주의"],
    [40, "crit", "심각"],
    [40.1, "alert", "경계"],
  ];

  it.each(boundaries)(
    "원천 라벨이 없으면 avgRatio %f → %s(%s)로 계산한다",
    async (avgRatio, code, label) => {
      const { client } = makeStatusClient({
        regional: {
          data: [
            { ...REGIONAL_ROW, avg_ratio: avgRatio, official_stage: null },
          ],
          error: null,
        },
      });
      const result = await buildStatus(NONSAN, makeDeps(okFetch, client));

      if (result.kind !== "ok") throw new Error("ok여야 한다");
      expect(result.body.region.avgRatio).toBe(avgRatio);
      expect(result.body.region.officialStage).toEqual({ code, label });
    },
  );
});

describe("buildStatus — 만수위 참고(highWaterNotice)", () => {
  /** 수위 API XML — 원저수율 시계열을 날짜·값으로 조립한다(탑정 고정). */
  function waterLevelXml(
    rows: readonly { date: string; rate: number }[],
  ): string {
    const items = rows
      .map(
        (row) =>
          `<item><check_date>${row.date}</check_date><county>충청남도 논산시 </county>` +
          `<fac_code>${TAPJEONG}</fac_code><fac_name>탑정</fac_name>` +
          `<rate>${String(row.rate)}</rate><water_level>27.4</water_level></item>`,
      )
      .join("");
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><body>' +
      `${items}<numOfRows>10</numOfRows><pageNo>1</pageNo>` +
      `<totalCount>${String(rows.length)}</totalCount></body>` +
      "<header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg>" +
      "<returnReasonCode>00</returnReasonCode></header></response>"
    );
  }

  async function noticeOf(deps: StatusServiceDeps): Promise<boolean> {
    const result = await buildStatus(NONSAN, deps);
    if (result.kind !== "ok") throw new Error("ok여야 한다");
    return result.body.highWaterNotice;
  }

  it("① 수위 API 시계열이 95 이상 + 상승이면 true", async () => {
    const highFetch: WaterLevelFetch = async () =>
      xmlResponse(
        waterLevelXml([
          { date: "20260719", rate: 95.2 },
          { date: "20260720", rate: 96 },
        ]),
      );
    const { client } = makeStatusClient({
      regional: { data: [REGIONAL_ROW], error: null },
    });
    expect(await noticeOf(makeDeps(highFetch, client))).toBe(true);
  });

  it("① 수위 API 시계열이 95 미만이면 false (샘플 XML 최신 60.4)", async () => {
    const { client } = makeStatusClient({
      regional: { data: [REGIONAL_ROW], error: null },
    });
    expect(await noticeOf(makeDeps(okFetch, client))).toBe(false);
  });

  it("② Supabase 폴백 시계열(96 상승)로도 true를 계산한다", async () => {
    const { client } = makeStatusClient({
      observations: {
        data: [
          { observed_on: "2026-07-19", rate: 96, water_level: 30.1 },
          { observed_on: "2026-07-18", rate: 95.2, water_level: 29.8 },
        ],
        error: null,
      },
      regional: { data: [REGIONAL_ROW], error: null },
    });
    const result = await buildStatus(NONSAN, makeDeps(timeoutFetch, client));
    if (result.kind !== "ok") throw new Error("ok여야 한다");
    expect(result.body.highWaterNotice).toBe(true);
    // 최신 관측 자체는 종전과 동일하게 첫 행이다.
    expect(result.body.reservoir.rate).toBe(96);
    expect(result.body.reservoir.observedOn).toBe("2026-07-19");
    expect(result.body.stale).toBe(true);
  });

  it("② Supabase 폴백이 관측 1점뿐이면(추세 불명) false", async () => {
    const { client } = makeStatusClient({
      observations: {
        data: [{ observed_on: "2026-07-19", rate: 96, water_level: 30.1 }],
        error: null,
      },
      regional: { data: [REGIONAL_ROW], error: null },
    });
    expect(await noticeOf(makeDeps(timeoutFetch, client))).toBe(false);
  });

  it("③ 커밋 스냅샷 대표지 시계열(95.2→96)로도 true를 계산한다", async () => {
    const downClient = makeStatusClient({
      observations: { data: null, error: { message: "connection refused" } },
      regional: { data: [REGIONAL_ROW], error: null },
    }).client;
    const deps = makeDeps(timeoutFetch, downClient, {
      snapshotObservations: {
        latestByFacility: [],
        representativeRecent30d: {
          [NONSAN]: {
            facCode: TAPJEONG,
            name: "탑정",
            rows: [
              { observedOn: "2026-07-18", rate: 95.2 },
              { observedOn: "2026-07-19", rate: 96 },
            ],
          },
        },
      },
    });
    expect(await noticeOf(deps)).toBe(true);
  });

  it("③ 스냅샷 latestByFacility 1점 폴백이면(시계열 미확보) false", async () => {
    const downClient = makeStatusClient({
      observations: { data: null, error: { message: "connection refused" } },
      regional: { data: [REGIONAL_ROW], error: null },
    }).client;
    const deps = makeDeps(timeoutFetch, downClient, {
      snapshotObservations: {
        latestByFacility: [
          {
            facCode: TAPJEONG,
            observedOn: "2026-07-19",
            rate: 96,
            source: "waterlevel_api",
          },
        ],
        representativeRecent30d: {},
      },
    });
    expect(await noticeOf(deps)).toBe(false);
  });
});

describe("buildStatus — 준비되지 않은 지역", () => {
  it("논가뭄지도에 없는 광역시 구 코드(27140)는 not_prepared", async () => {
    const { client } = makeStatusClient({});
    const result = await buildStatus("27140", makeDeps(okFetch, client));
    expect(result.kind).toBe("not_prepared");
  });

  it("시군은 있어도 대표 저수지 후보가 없으면(27000) not_prepared", async () => {
    const { client } = makeStatusClient({});
    const emptyResolver: RegionResolverDeps = {
      createClient: (): ReservoirsClient => ({
        from: () => ({
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    };
    const result = await buildStatus(
      "27000",
      makeDeps(okFetch, client, { resolver: emptyResolver }),
    );
    expect(result.kind).toBe("not_prepared");
  });
});
