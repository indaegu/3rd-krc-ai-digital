import type {
  ApiError,
  RegionResolveRequest,
  RegionSearchResponse,
  StatusResponse,
} from "@mulsigye/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
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

afterEach(() => {
  vi.unstubAllGlobals();
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
