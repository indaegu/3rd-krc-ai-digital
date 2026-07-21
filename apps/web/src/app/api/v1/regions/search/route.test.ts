// GET /api/v1/regions/search 라우트 테스트.
// Juso는 전부 mock — 실키 호출 금지. 주소 원문(검색어·roadAddr)이 구조화 로그와
// Supabase 경로에 나타나지 않음을 spy·소스 검사로 강제한다(플랜 Global Constraints).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ApiError, RegionSearchResponse } from "@mulsigye/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchHandler } from "./route";

const jusoFixture = readFileSync(
  resolve(process.cwd(), "test", "fixtures", "juso-search-sample.json"),
  "utf8",
);

const QUERY = "나주 빛가람로 17";
/** 검색어·응답 주소 원문 조각 — 로그 어디에도 나타나면 안 된다. */
const ADDRESS_FRAGMENTS = ["나주", "빛가람로", "송월동", QUERY];

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

function loggedText(): string {
  return JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls));
}

function expectNoAddressInLogs(): void {
  const text = loggedText();
  for (const fragment of ADDRESS_FRAGMENTS) {
    expect(text).not.toContain(fragment);
  }
}

function searchRequest(q?: string): Request {
  const url = new URL("http://localhost/api/v1/regions/search");
  if (q !== undefined) {
    url.searchParams.set("q", q);
  }
  return new Request(url);
}

function jusoResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  consoleSpies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/v1/regions/search", () => {
  it("Juso 후보를 계약 형태(admCd + bdMgtSn 앞 10자리 legalCode)로 매핑한다", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      void input;
      return jusoResponse(jusoFixture);
    });
    const handler = createSearchHandler({
      juso: { fetchImpl, apiKey: "test-key" },
    });

    const response = await handler(searchRequest(QUERY));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as RegionSearchResponse;
    expect(body.schemaVersion).toBe("1");
    expect(body.stale).toBe(false);
    expect(body.sources).toEqual(["도로명주소 API"]);
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0]).toEqual({
      label: "전남광주통합특별시 나주시 빛가람로 17 (송월동)",
      admCd: "1217010200",
      legalCode: "4617010200",
    });
    expect(body.candidates[1]?.legalCode).toBe("4617010200");

    // Juso 호출 자체는 키·keyword·resultType=json을 포함해야 한다.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("business.juso.go.kr/addrlink/addrLinkApi.do");
    expect(calledUrl).toContain("confmKey=test-key");
    expect(calledUrl).toContain("resultType=json");

    expectNoAddressInLogs();
  });

  it("Juso errorCode가 0이 아니면 retryable=true 503을 돌려준다", async () => {
    const errorBody = JSON.stringify({
      results: {
        common: { errorCode: "E0006", errorMessage: "시스템 오류" },
        juso: null,
      },
    });
    const handler = createSearchHandler({
      juso: { fetchImpl: async () => jusoResponse(errorBody), apiKey: "k" },
    });

    const response = await handler(searchRequest(QUERY));
    expect(response.status).toBe(503);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(true);
    expect(body.code.length).toBeGreaterThan(0);
    expect(body.message.length).toBeGreaterThan(0);

    expectNoAddressInLogs();
  });

  it("Juso 네트워크 오류·timeout이면 retryable=true 503을 돌려준다", async () => {
    const handler = createSearchHandler({
      juso: {
        fetchImpl: async () => {
          throw new Error("timeout");
        },
        apiKey: "k",
      },
    });

    const response = await handler(searchRequest(QUERY));
    expect(response.status).toBe(503);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(true);

    expectNoAddressInLogs();
  });

  it("q가 없으면 retryable=false 400을 돌려준다", async () => {
    const fetchImpl = vi.fn();
    const handler = createSearchHandler({ juso: { fetchImpl, apiKey: "k" } });

    const response = await handler(searchRequest());
    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiError;
    expect(body.retryable).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("q가 너무 짧으면(공백 제거 후 2자 미만) 400을 돌려준다", async () => {
    const fetchImpl = vi.fn();
    const handler = createSearchHandler({ juso: { fetchImpl, apiKey: "k" } });

    for (const q of ["나", "  나  ", ""]) {
      const response = await handler(searchRequest(q));
      expect(response.status).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("검색 경로 모듈은 Supabase를 참조하지 않는다(주소 원문이 저장소로 흐를 수 없음)", () => {
    const routeSource = readFileSync(
      resolve(
        process.cwd(),
        "src",
        "app",
        "api",
        "v1",
        "regions",
        "search",
        "route.ts",
      ),
      "utf8",
    );
    const jusoSource = readFileSync(
      resolve(process.cwd(), "src", "lib", "data", "juso.ts"),
      "utf8",
    );
    expect(routeSource + jusoSource).not.toMatch(/supabase/i);
  });
});
