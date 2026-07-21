// POST /api/v1/regions/resolve 라우트 테스트.
// Supabase는 전부 mock — 호출 인자에 주소 원문 키가 없음을 강제하고,
// 실패 시 커밋 스냅샷 폴백(stale=true)과 결정성(반복 호출 동일)을 검증한다.
import type { ApiError, RegionResolveResponse } from "@mulsigye/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReservoirsClient } from "../../../../../lib/data/region-resolver";
import { createResolveHandler } from "./route";

type ReservoirQueryCall = {
  table: string;
  columns: string;
  column: string;
  value: string;
};

type QueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

function makeSupabaseMock(result: QueryResult): {
  client: ReservoirsClient;
  calls: ReservoirQueryCall[];
} {
  const calls: ReservoirQueryCall[] = [];
  const client: ReservoirsClient = {
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              calls.push({ table, columns, column, value });
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

function resolveRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/regions/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const NAJU_BODY = { admCd: "1217010200", legalCode: "4617010200" };
const NONSAN_BODY = { admCd: "4423010100", legalCode: "4423010100" };

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

describe("POST /api/v1/regions/resolve", () => {
  it("admCd 앞 5자리(12170)가 없으면 legalCode(46170) 폴백으로 나주시를 매칭한다", async () => {
    const { client, calls } = makeSupabaseMock({
      data: [
        { fac_code: "4617010134", name: "백용", beneficiary_area: 616.3 },
        { fac_code: "4617010200", name: "나주호", beneficiary_area: 9267 },
      ],
      error: null,
    });
    const handler = createResolveHandler({ createClient: () => client });

    const response = await handler(resolveRequest(NAJU_BODY));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as RegionResolveResponse;
    expect(body.schemaVersion).toBe("1");
    expect(body.sigunCode).toBe("46170");
    expect(body.sigunName).toBe("나주시");
    expect(body.prepared).toBe(true);
    expect(body.reservoir).toEqual({ facCode: "4617010200", name: "나주호" });
    expect(body.stale).toBe(false);

    // Supabase 조회는 시군코드 하나로만 — admCd 폴백이 실제로 일어났다.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("reservoirs");
    expect(calls[0]?.column).toBe("sigun_code");
    expect(calls[0]?.value).toBe("46170");

    // 주소 원문 키·주소 문자열이 Supabase 호출 인자와 로그에 없다.
    const callText = JSON.stringify(calls);
    const logText = JSON.stringify(
      consoleSpies.flatMap((spy) => spy.mock.calls),
    );
    for (const forbidden of [
      "roadAddr",
      "jibunAddr",
      "label",
      "bdMgtSn",
      "빛가람로",
    ]) {
      expect(callText).not.toContain(forbidden);
      expect(logText).not.toContain(forbidden);
    }
  });

  it("논산(44230)은 반복 호출해도 항상 탑정(4423010045)을 결정한다 — 스냅샷 폴백 포함", async () => {
    const handler = createResolveHandler({
      createClient: () => {
        throw new Error("supabase unavailable");
      },
    });

    for (let i = 0; i < 10; i += 1) {
      const response = await handler(resolveRequest(NONSAN_BODY));
      expect(response.status).toBe(200);
      const body = (await response.json()) as RegionResolveResponse;
      expect(body.sigunCode).toBe("44230");
      expect(body.sigunName).toBe("논산시");
      expect(body.prepared).toBe(true);
      expect(body.reservoir).toEqual({ facCode: "4423010045", name: "탑정" });
      expect(body.stale).toBe(true);
      expect(body.sources).toContain("커밋 스냅샷");
    }
  });

  it("Supabase가 error를 돌려주면 커밋 스냅샷으로 폴백하고 stale=true", async () => {
    const { client } = makeSupabaseMock({
      data: null,
      error: { message: 'relation "reservoirs" does not exist' },
    });
    const handler = createResolveHandler({ createClient: () => client });

    const response = await handler(resolveRequest(NAJU_BODY));
    expect(response.status).toBe(200);
    const body = (await response.json()) as RegionResolveResponse;
    expect(body.sigunCode).toBe("46170");
    expect(body.prepared).toBe(true);
    // 커밋 스냅샷 실측: 나주시 대표지는 나주호(수혜면적 9,267).
    expect(body.reservoir).toEqual({ facCode: "4617010200", name: "나주호" });
    expect(body.stale).toBe(true);
  });

  it("시군은 알지만 저수지 후보가 없으면 200 prepared=false·reservoir=null", async () => {
    const { client } = makeSupabaseMock({ data: [], error: null });
    const handler = createResolveHandler({ createClient: () => client });

    // 27000(대구)은 논가뭄지도에 있지만 시설제원 저수지 후보가 없다.
    const response = await handler(
      resolveRequest({ admCd: "2700010100", legalCode: "2700010100" }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as RegionResolveResponse;
    expect(body.sigunCode).toBe("27000");
    expect(body.sigunName).not.toBeNull();
    expect(body.prepared).toBe(false);
    expect(body.reservoir).toBeNull();
    expect(body.stale).toBe(false);
  });

  it("광역시 구 코드(27140)는 준비 중 — prepared=false이고 저수지 조회를 하지 않는다", async () => {
    const { client, calls } = makeSupabaseMock({ data: [], error: null });
    const handler = createResolveHandler({ createClient: () => client });

    const response = await handler(
      resolveRequest({ admCd: "2714010100", legalCode: "2714010100" }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as RegionResolveResponse;
    expect(body.sigunCode).toBe("27140");
    expect(body.sigunName).toBeNull();
    expect(body.prepared).toBe(false);
    expect(body.reservoir).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("본문이 잘못되면 retryable=false 400을 돌려준다", async () => {
    const { client } = makeSupabaseMock({ data: [], error: null });
    const handler = createResolveHandler({ createClient: () => client });

    const invalidBodies: unknown[] = [
      { admCd: "1217010200" }, // legalCode 누락
      { admCd: "12345", legalCode: "4617010200" }, // 10자리 아님
      { admCd: "1217010200", legalCode: "461701020X" }, // 숫자 아님
      "not-json{{",
    ];
    for (const invalid of invalidBodies) {
      const response = await handler(resolveRequest(invalid));
      expect(response.status).toBe(400);
      const body = (await response.json()) as ApiError;
      expect(body.retryable).toBe(false);
      expect(body.message.length).toBeGreaterThan(0);
    }
  });
});
