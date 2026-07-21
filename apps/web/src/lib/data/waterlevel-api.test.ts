// 농촌용수 저수지 수위 API 호출 테스트 — 전부 mock, 실 KRC 키 호출 금지.
// 디코딩 키 encodeURIComponent·60분 캐시(next.revalidate=3600)·키 로그 미노출을 강제한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchLatestWaterLevel,
  WATERLEVEL_ENDPOINT,
  type WaterLevelFetch,
} from "./waterlevel-api";

const sampleXml = readFileSync(
  join(process.cwd(), "test", "fixtures", "krc-waterlevel-sample.xml"),
  "utf8",
);

// 디코딩 키 형태(+·/·=·& 포함) — encodeURIComponent가 실제로 필요함을 검증한다.
const RAW_KEY = "raw+key/with=special&chars";
const ENCODED_KEY = encodeURIComponent(RAW_KEY);
// KST 2026-07-21 12:00 — date_e=20260721, date_s=20260708(최근 14일).
const FIXED_NOW = new Date("2026-07-21T03:00:00.000Z");

const FAC_CODE = "4423010045";

function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { "content-type": "application/xml" },
  });
}

const ERROR_XML =
  "<response><header><returnAuthMsg>SERVICE KEY IS NOT REGISTERED ERROR</returnAuthMsg>" +
  "<returnReasonCode>30</returnReasonCode></header></response>";

const EMPTY_XML =
  "<response><body><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>0</totalCount></body>" +
  "<header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg><returnReasonCode>00</returnReasonCode>" +
  "</header></response>";

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

function expectKeyNeverLogged(): void {
  const logText = JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls));
  expect(logText).not.toContain(RAW_KEY);
  expect(logText).not.toContain(ENCODED_KEY);
}

function makeDeps(fetchImpl: WaterLevelFetch) {
  return { fetchImpl, apiKey: RAW_KEY, now: () => FIXED_NOW };
}

describe("fetchLatestWaterLevel — 성공 경로", () => {
  it("샘플 XML에서 check_date 최대(2026-07-20) 관측을 최신으로 고른다", async () => {
    const fetchMock = vi.fn(async () => xmlResponse(sampleXml));
    const result = await fetchLatestWaterLevel(FAC_CODE, makeDeps(fetchMock));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("성공이어야 한다");
    expect(result.latest).toEqual({
      facCode: FAC_CODE,
      facName: "탑정",
      observedOn: "2026-07-20",
      rate: 60.4,
      waterLevel: 27.48,
    });
    expect(result.observations).toHaveLength(7);
    expectKeyNeverLogged();
  });

  it("URL에 serviceKey를 encodeURIComponent로 넣고 fac_code·최근 14일 date_s/date_e를 담는다", async () => {
    const fetchMock = vi.fn(async () => xmlResponse(sampleXml));
    await fetchLatestWaterLevel(FAC_CODE, makeDeps(fetchMock));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      { next?: { revalidate?: number } } | undefined,
    ];
    const url = call[0];
    expect(url.startsWith(WATERLEVEL_ENDPOINT)).toBe(true);
    expect(url).toContain(`serviceKey=${ENCODED_KEY}`);
    expect(url).not.toContain(RAW_KEY);
    expect(url).toContain(`fac_code=${FAC_CODE}`);
    expect(url).toContain("date_s=20260708");
    expect(url).toContain("date_e=20260721");
  });

  it("fetch 옵션에 next.revalidate === 3600(60분 캐시)을 지정한다", async () => {
    const fetchMock = vi.fn(async () => xmlResponse(sampleXml));
    await fetchLatestWaterLevel(FAC_CODE, makeDeps(fetchMock));

    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      { next?: { revalidate?: number } } | undefined,
    ];
    expect(call[1]?.next?.revalidate).toBe(3600);
  });
});

describe("fetchLatestWaterLevel — 장애·경계 케이스", () => {
  it("HTTP 500이면 ok=false — 키는 어떤 로그에도 남지 않는다", async () => {
    const fetchMock = vi.fn(async () => xmlResponse("server error", 500));
    const result = await fetchLatestWaterLevel(FAC_CODE, makeDeps(fetchMock));
    expect(result.ok).toBe(false);
    expectKeyNeverLogged();
  });

  it('returnReasonCode !== "00"이면 ok=false', async () => {
    const fetchMock = vi.fn(async () => xmlResponse(ERROR_XML));
    const result = await fetchLatestWaterLevel(FAC_CODE, makeDeps(fetchMock));
    expect(result.ok).toBe(false);
    expectKeyNeverLogged();
  });

  it("timeout(fetch reject)이면 throw 없이 ok=false", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const result = await fetchLatestWaterLevel(FAC_CODE, makeDeps(fetchMock));
    expect(result.ok).toBe(false);
    expectKeyNeverLogged();
  });

  it("정상 코드지만 관측이 0건이면 ok=false", async () => {
    const fetchMock = vi.fn(async () => xmlResponse(EMPTY_XML));
    const result = await fetchLatestWaterLevel(FAC_CODE, makeDeps(fetchMock));
    expect(result.ok).toBe(false);
  });

  it("API 키가 없으면 fetch를 호출하지 않고 ok=false", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "");
    const fetchMock = vi.fn(async () => xmlResponse(sampleXml));
    const result = await fetchLatestWaterLevel(FAC_CODE, {
      fetchImpl: fetchMock,
      apiKey: undefined,
      now: () => FIXED_NOW,
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
