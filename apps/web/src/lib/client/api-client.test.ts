import type {
  ApiError,
  CoachResponse,
  RegionResolveRequest,
  RegionSearchResponse,
  StatusResponse,
} from "@mulsigye/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearCoachCache,
  getCoach,
  getForecast,
  getStatus,
  resolveRegion,
  searchRegions,
} from "./api-client";

// packages/contracts/examples/status.ok.json과 같은 계약 정합 픽스처.
const STATUS_OK = {
  schemaVersion: "1",
  sigunCode: "44230",
  sigunName: "논산시",
  reservoir: {
    facCode: "4423010045",
    name: "탑정",
    rate: 87.5,
    waterLevel: 32.1,
    observedOn: "2026-07-20",
  },
  region: {
    observedOn: "2026-07-20",
    regionalRate: 82.4,
    normalRate: 88.1,
    avgRatio: 93.5,
    officialStage: { code: "ok", label: "정상" },
  },
  highWaterNotice: false,
  asOf: "2026-07-21T00:00:00.000Z",
  sources: ["농촌용수 저수지 수위정보 조회", "논가뭄지도"],
  stale: false,
} satisfies StatusResponse;

const SEARCH_OK = {
  schemaVersion: "1",
  candidates: [],
  asOf: "2026-07-21T00:00:00.000Z",
  sources: ["도로명주소 API"],
  stale: false,
} satisfies RegionSearchResponse;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Response 본문은 1회만 읽을 수 있어, 여러 번 페치하는 캐시 테스트는 호출마다 새 Response를 만든다.
function stubFetchFactory(makeResponse: () => Response) {
  const fetchMock = vi.fn(() => Promise.resolve(makeResponse()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const COACH_OK = {
  schemaVersion: "1",
  mode: "static",
  dataStale: false,
  cacheHit: false,
  generatedAt: "2026-07-21T00:00:00.000Z",
  promptVersion: "coach-v1",
  actionCatalogVersion: "actions-v1",
  coach: {
    headline: "지금 할 일을 하나씩 확인해요.",
    summary: "예측은 참고 정보예요. 공식 가뭄 예·경보를 먼저 확인해요.",
    actions: [
      {
        id: "care_check_official_notice",
        title: "공식 가뭄 안내를 확인해요",
        reason: "우리 지역 공식 예·경보가 가장 정확한 기준이에요.",
      },
    ],
  },
  fallbackReason: "disabled",
  asOf: "2026-07-21T00:00:00.000Z",
  sources: ["논가뭄지도"],
  stale: false,
} satisfies CoachResponse;

afterEach(() => {
  vi.unstubAllGlobals();
  clearCoachCache();
});

describe("api-client 정상 경로", () => {
  it("getStatus는 sigunCode 쿼리로 호출하고 계약 타입 데이터를 돌려준다", async () => {
    const fetchMock = stubFetch(jsonResponse(STATUS_OK, 200));

    const result = await getStatus("44230");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/status?sigunCode=44230",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result).toEqual({ kind: "ok", data: STATUS_OK });
  });

  it("searchRegions는 검색어를 URL 인코딩해 호출한다", async () => {
    const fetchMock = stubFetch(jsonResponse(SEARCH_OK, 200));

    const result = await searchRegions("논산 시민로");

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/regions/search?q=${encodeURIComponent("논산 시민로")}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result.kind).toBe("ok");
  });

  it("resolveRegion은 코드 2개만 JSON 본문으로 POST한다", async () => {
    const request: RegionResolveRequest = {
      admCd: "4423000000",
      legalCode: "4423000000",
    };
    const fetchMock = stubFetch(
      jsonResponse(
        {
          schemaVersion: "1",
          sigunCode: "44230",
          sigunName: "논산시",
          prepared: true,
          reservoir: { facCode: "4423010045", name: "탑정" },
          asOf: "2026-07-21T00:00:00.000Z",
          sources: ["도로명주소 API"],
          stale: false,
        },
        200,
      ),
    );

    const result = await resolveRegion(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/regions/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(result.kind).toBe("ok");
  });
});

describe("api-client 오류 매핑", () => {
  it("400 ApiError는 retryable=false로 매핑한다", async () => {
    const body: ApiError = {
      code: "invalid_sigun_code",
      message: "시군 코드를 확인해 주세요.",
      retryable: false,
    };
    stubFetch(jsonResponse(body, 400));

    const result = await getForecast("abc");

    expect(result).toEqual({ kind: "error", ...body });
  });

  it("404 ApiError는 retryable=false로 매핑한다", async () => {
    const body: ApiError = {
      code: "region_not_ready",
      message: "아직 준비되지 않은 지역이에요.",
      retryable: false,
    };
    stubFetch(jsonResponse(body, 404));

    const result = await getCoach("99999");

    expect(result).toEqual({ kind: "error", ...body });
  });

  it("503 ApiError는 retryable=true로 매핑한다", async () => {
    const body: ApiError = {
      code: "upstream_unavailable",
      message: "지금은 정보를 불러오지 못했어요.",
      retryable: true,
    };
    stubFetch(jsonResponse(body, 503));

    const result = await getStatus("44230");

    expect(result).toEqual({ kind: "error", ...body });
  });

  it("ApiError 형태가 아닌 5xx 본문도 재시도 가능 오류로 처리한다", async () => {
    stubFetch(new Response("Bad Gateway", { status: 502 }));

    const result = await getStatus("44230");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.retryable).toBe(true);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("네트워크 예외는 retryable=true 오류로 돌려준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const result = await getForecast("44230");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.retryable).toBe(true);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});

describe("getCoach 클라이언트 캐시", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("TTL 이내 재호출은 다시 페치하지 않고 캐시된 성공을 돌려준다", async () => {
    const fetchMock = stubFetchFactory(() => jsonResponse(COACH_OK, 200));

    const first = await getCoach("44230");
    const second = await getCoach("44230");

    expect(first).toEqual({ kind: "ok", data: COACH_OK });
    expect(second).toEqual({ kind: "ok", data: COACH_OK });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("지역 코드가 다르면 각각 페치한다(캐시 키 = sigunCode)", async () => {
    const fetchMock = stubFetchFactory(() => jsonResponse(COACH_OK, 200));

    await getCoach("44230");
    await getCoach("46170");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("force 옵션은 캐시를 우회해 항상 다시 페치한다", async () => {
    const fetchMock = stubFetchFactory(() => jsonResponse(COACH_OK, 200));

    await getCoach("44230");
    await getCoach("44230", { force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("TTL이 지나면 다시 페치한다", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetchFactory(() => jsonResponse(COACH_OK, 200));

    await getCoach("44230");
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    await getCoach("44230");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("오류 응답은 캐시하지 않는다", async () => {
    const body: ApiError = {
      code: "coach_unavailable",
      message: "코치 설명을 지금 불러오지 못했어요.",
      retryable: true,
    };
    const fetchMock = stubFetchFactory(() => jsonResponse(body, 503));

    const first = await getCoach("44230");
    const second = await getCoach("44230");

    expect(first.kind).toBe("error");
    expect(second.kind).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
