// 단계 2 완료 게이트 테스트 — 대표 3개 시군(논산 44230·나주 46170·기장 26710, 사용자 확정).
// (a) resolve를 10회 반복 호출해도 항상 같은 대표 저수지 하나로 매칭된다
//     — 정상 모드(Supabase mock)·커밋 스냅샷 폴백 모드 양쪽.
// (b) status가 3단 폴백 각 모드(수위 API 성공 / Supabase 폴백 / 커밋 스냅샷 폴백)에서
//     모두 HTTP 200을 유지한다.
// 실 네트워크 호출 금지 — fetch·Supabase 전부 DI mock(기존 route 테스트 패턴).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  RegionResolveResponse,
  StatusResponse,
} from "@mulsigye/contracts";
import { describe, expect, it } from "vitest";
import type {
  RegionResolverDeps,
  ReservoirsClient,
} from "../src/lib/data/region-resolver";
import type { StatusSupabaseClient } from "../src/lib/data/status-service";
import type { WaterLevelFetch } from "../src/lib/data/waterlevel-api";
import { createResolveHandler } from "../src/app/api/v1/regions/resolve/route";
import { createStatusHandler } from "../src/app/api/v1/status/route";

// 대표지 facCode 출처: data/snapshots/reservoirs.json 실측 —
// 결정 규칙(같은 시군 후보 중 수혜면적 최대 → 동률 시 facCode 오름차순)으로 도출.
//   논산 44230: 탑정 4423010045 (수혜면적 5,713 — 2위 가곡 207.7)
//   나주 46170: 나주호 4617010200 (수혜면적 9,267 — 2위 백용 616.3)
//   기장 26710: 병산 2671010067 (수혜면적 56 — 2위 용천 49)
const REGIONS = [
  {
    sigunCode: "44230",
    sigunName: "논산시",
    facCode: "4423010045",
    name: "탑정",
  },
  {
    sigunCode: "46170",
    sigunName: "나주시",
    facCode: "4617010200",
    name: "나주호",
  },
  {
    sigunCode: "26710",
    sigunName: "기장군",
    facCode: "2671010067",
    name: "병산",
  },
] as const;

type Region = (typeof REGIONS)[number];

type SnapshotReservoir = {
  facCode: string;
  name: string;
  sigunCode: string;
  beneficiaryArea: number | null;
};

// 커밋 스냅샷 전체를 '정상 모드' Supabase 응답으로 재사용한다 —
// 실데이터 기준으로도 결정 규칙이 위 하드코딩 값에 도달함을 함께 검증하기 위함.
const SNAPSHOT_RESERVOIRS = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "..", "..", "data", "snapshots", "reservoirs.json"),
    "utf8",
  ),
) as SnapshotReservoir[];

/** 정상 모드: 시군코드 조회에 스냅샷 실데이터를 돌려주는 Supabase mock. */
function makeReservoirsClient(): ReservoirsClient {
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) =>
          Promise.resolve({
            data: SNAPSHOT_RESERVOIRS.filter(
              (row) => row.sigunCode === value,
            ).map((row) => ({
              fac_code: row.facCode,
              name: row.name,
              beneficiary_area: row.beneficiaryArea,
            })),
            error: null,
          }),
      }),
    }),
  };
}

const workingResolver: RegionResolverDeps = {
  createClient: makeReservoirsClient,
};

const brokenResolver: RegionResolverDeps = {
  createClient: () => {
    throw new Error("supabase unavailable");
  },
};

/** 수위 API 정상 응답 XML — 시설코드만 바꿔 세 시군에 재사용한다(실측 스키마). */
function waterLevelXml(facCode: string, name: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><body>',
    `<item><check_date>20260720</check_date><county>게이트 테스트 </county>`,
    `<fac_code>${facCode}</fac_code><fac_name>${name}</fac_name>`,
    "<rate>61.2</rate><water_level>12.34</water_level></item>",
    "<numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount>",
    "</body><header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg>",
    "<returnReasonCode>00</returnReasonCode></header></response>",
  ].join("");
}

function okFetch(region: Region): WaterLevelFetch {
  return async () =>
    new Response(waterLevelXml(region.facCode, region.name), {
      status: 200,
      headers: { "content-type": "application/xml" },
    });
}

const downFetch: WaterLevelFetch = async () => {
  throw new DOMException("The operation timed out.", "TimeoutError");
};

/** status용 Supabase mock — 관측·지역 단계 조회와 upsert 표면만 흉내 낸다. */
function makeStatusClient(): StatusSupabaseClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return Promise.resolve({
                        data:
                          table === "regional_drought_daily"
                            ? [
                                {
                                  observed_on: "2026-07-20",
                                  regional_rate: 55.1,
                                  normal_rate: 80,
                                  avg_ratio: 95.3,
                                  official_stage: "정상",
                                },
                              ]
                            : [
                                {
                                  observed_on: "2026-07-19",
                                  rate: 58.8,
                                  water_level: 11.1,
                                },
                              ],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
        upsert() {
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");

function resolveRequest(region: Region): Request {
  // 게이트는 시군구 판정까지만 본다 — 읍면동 5자리는 임의값(10100)로 고정.
  const code = `${region.sigunCode}10100`;
  return new Request("http://localhost/api/v1/regions/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ admCd: code, legalCode: code }),
  });
}

function statusRequest(region: Region): Request {
  return new Request(
    `http://localhost/api/v1/status?sigunCode=${region.sigunCode}`,
  );
}

describe.each(REGIONS)(
  "단계 2 완료 게이트 — $sigunName($sigunCode)",
  (region) => {
    it(`resolve 10회 반복(정상 모드)이 항상 ${region.name}(${region.facCode})을 돌려준다`, async () => {
      const handler = createResolveHandler(workingResolver);
      for (let i = 0; i < 10; i += 1) {
        const response = await handler(resolveRequest(region));
        expect(response.status).toBe(200);
        const body = (await response.json()) as RegionResolveResponse;
        expect(body.sigunCode).toBe(region.sigunCode);
        expect(body.sigunName).toBe(region.sigunName);
        expect(body.prepared).toBe(true);
        expect(body.reservoir).toEqual({
          facCode: region.facCode,
          name: region.name,
        });
        expect(body.stale).toBe(false);
      }
    });

    it(`resolve 10회 반복(커밋 스냅샷 폴백 모드)도 동일하게 ${region.facCode}를 돌려준다`, async () => {
      const handler = createResolveHandler(brokenResolver);
      for (let i = 0; i < 10; i += 1) {
        const response = await handler(resolveRequest(region));
        expect(response.status).toBe(200);
        const body = (await response.json()) as RegionResolveResponse;
        expect(body.sigunCode).toBe(region.sigunCode);
        expect(body.prepared).toBe(true);
        expect(body.reservoir).toEqual({
          facCode: region.facCode,
          name: region.name,
        });
        expect(body.stale).toBe(true);
        expect(body.sources).toContain("커밋 스냅샷");
      }
    });

    it("status ① 수위 API 성공 모드 — HTTP 200, stale=false", async () => {
      const handler = createStatusHandler({
        waterLevel: {
          fetchImpl: okFetch(region),
          apiKey: "gate-test-key",
          now: () => FIXED_NOW,
        },
        createClient: makeStatusClient,
        resolver: workingResolver,
        now: () => FIXED_NOW,
      });
      const response = await handler(statusRequest(region));
      expect(response.status).toBe(200);
      const body = (await response.json()) as StatusResponse;
      expect(body.sigunCode).toBe(region.sigunCode);
      expect(body.reservoir.facCode).toBe(region.facCode);
      expect(body.reservoir.rate).toBe(61.2);
      expect(body.reservoir.observedOn).toBe("2026-07-20");
      expect(body.stale).toBe(false);
    });

    it("status ② Supabase 폴백 모드 — API 장애여도 HTTP 200, stale=true", async () => {
      const handler = createStatusHandler({
        waterLevel: {
          fetchImpl: downFetch,
          apiKey: "gate-test-key",
          now: () => FIXED_NOW,
        },
        createClient: makeStatusClient,
        resolver: workingResolver,
        now: () => FIXED_NOW,
      });
      const response = await handler(statusRequest(region));
      expect(response.status).toBe(200);
      const body = (await response.json()) as StatusResponse;
      expect(body.reservoir.facCode).toBe(region.facCode);
      expect(body.reservoir.observedOn).toBe("2026-07-19");
      expect(body.stale).toBe(true);
      expect(body.sources).toContain("Supabase 스냅샷");
    });

    it("status ③ 커밋 스냅샷 폴백 모드 — API·Supabase 모두 장애여도 HTTP 200, stale=true", async () => {
      const handler = createStatusHandler({
        waterLevel: {
          fetchImpl: downFetch,
          apiKey: "gate-test-key",
          now: () => FIXED_NOW,
        },
        createClient: () => {
          throw new Error("supabase unavailable");
        },
        resolver: brokenResolver,
        now: () => FIXED_NOW,
      });
      const response = await handler(statusRequest(region));
      expect(response.status).toBe(200);
      const body = (await response.json()) as StatusResponse;
      expect(body.reservoir.facCode).toBe(region.facCode);
      expect(body.stale).toBe(true);
      expect(
        body.sources.some((source) => source.startsWith("커밋 스냅샷(기준 ")),
      ).toBe(true);
    });
  },
);
