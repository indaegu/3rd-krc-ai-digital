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

  it("Juso 시스템 오류는 retryable=true 503을 돌려준다", async () => {
    const errorBody = JSON.stringify({
      results: {
        common: { errorCode: "E0001", errorMessage: "시스템에러" },
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

// 도로명주소 공식 오류표(business.juso.go.kr) → 사용자 안내 매핑.
// 종전에는 모든 실패가 하나의 503 "잠시 어려워요"로 뭉개져, "인천"처럼 시·도만 넣은
// 경우에도 재시도하라는 엉뚱한 안내가 나갔다.
describe("GET /api/v1/regions/search — 공식 오류표 안내", () => {
  /** 오류메시지만 바꿔 같은 형태의 실패 응답을 만든다. */
  async function failWith(
    errorMessage: string,
  ): Promise<ApiError & { status: number }> {
    const body = JSON.stringify({
      results: { common: { errorCode: "E9999", errorMessage }, juso: null },
    });
    const handler = createSearchHandler({
      juso: { fetchImpl: async () => jusoResponse(body), apiKey: "k" },
    });
    const response = await handler(searchRequest(QUERY));
    return {
      ...((await response.json()) as ApiError),
      status: response.status,
    };
  }

  const CASES = [
    {
      official: "주소를 상세히 입력해 주시기 바랍니다.",
      code: "JUSO_TOO_BROAD",
      contains: "시·군·구",
    },
    {
      official: "검색 범위를 초과하였습니다.",
      code: "JUSO_TOO_MANY",
      contains: "너무 많아요",
    },
    {
      official: "검색어는 두글자 이상 입력되어야 합니다.",
      code: "JUSO_TOO_SHORT",
      contains: "두 글자",
    },
    {
      official: "검색어는 문자와 숫자 같이 입력되어야 합니다.",
      code: "JUSO_DIGITS_ONLY",
      contains: "숫자만",
    },
    {
      official: "검색어에 너무 긴 숫자가 포함되어 있습니다. (숫자 10자 이하)",
      code: "JUSO_LONG_NUMBER",
      contains: "10자리",
    },
    {
      official: "검색어가 너무 깁니다.(한글40자, 영문, 숫자 80자 이하)",
      code: "JUSO_TOO_LONG",
      contains: "너무 길어요",
    },
    {
      official: "특수문자+숫자만으로는 검색이 불가능합니다.",
      code: "JUSO_FORBIDDEN_CHARS",
      contains: "특수문자",
    },
    {
      official:
        "SQL 예약어 또는 특수문자(%,=, >, <, [, ])는 검색이 불가능합니다.",
      code: "JUSO_FORBIDDEN_CHARS",
      contains: "특수문자",
    },
    {
      official: "검색어가 입력되지 않았습니다.",
      code: "JUSO_EMPTY",
      contains: "검색어",
    },
  ] as const;

  for (const testCase of CASES) {
    it(`"${testCase.official}" → 고칠 방법을 알려주는 400`, async () => {
      const body = await failWith(testCase.official);
      // 사용자가 고칠 수 있는 입력 문제라 400·retryable=false다(다시 시도 버튼을 띄우지 않는다).
      expect(body.status).toBe(400);
      expect(body.retryable).toBe(false);
      expect(body.code).toBe(testCase.code);
      expect(body.message).toContain(testCase.contains);
      expectNoAddressInLogs();
    });
  }

  it("승인키 문제는 503이지만 다시 시도해도 풀리지 않으므로 retryable=false다", async () => {
    const body = await failWith("승인되지 않은 KEY 입니다.");
    expect(body.status).toBe(503);
    expect(body.code).toBe("JUSO_AUTH");
    expect(body.retryable).toBe(false);
  });

  it("개발승인키 만료도 같은 승인 문제로 본다", async () => {
    const body = await failWith(
      "개발승인키 기간이 만료되어 서비스를 이용하실 수 없습니다",
    );
    expect(body.code).toBe("JUSO_AUTH");
  });

  it("표에 없는 응답은 재시도 가능한 503으로 둔다", async () => {
    const body = await failWith("알 수 없는 무언가");
    expect(body.status).toBe(503);
    expect(body.code).toBe("JUSO_UNAVAILABLE");
    expect(body.retryable).toBe(true);
  });
});
