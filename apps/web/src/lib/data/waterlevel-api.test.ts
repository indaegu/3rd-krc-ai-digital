// 농촌용수 저수지 수위 API 호출 테스트 — 전부 mock, 실 KRC 키 호출 금지.
// 디코딩 키 encodeURIComponent·60분 캐시(next.revalidate=3600)·키 로그 미노출을 강제한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCountyWaterLevels,
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
// KST 2026-07-21 12:00 — date_e=20260721, date_s=20260622(최근 30일).
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

  it("URL에 serviceKey를 encodeURIComponent로 넣고 fac_code·최근 30일 date_s/date_e를 담는다", async () => {
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
    // 차트 "저수지 실측"을 30일로 보여주므로 조회도 30일이다(시설코드 조회 최대 365일).
    expect(url).toContain("date_s=20260622");
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

/** 시군 조회 응답 한 페이지를 만든다 — totalCount로 페이지 이어받기를 제어한다. */
function countyXml(
  items: { facCode: string; date: string; rate: number }[],
  { pageNo, totalCount }: { pageNo: number; totalCount: number },
): string {
  const body = items
    .map(
      (item) =>
        `<item><check_date>${item.date}</check_date><county>충청남도 아산시 </county>` +
        `<fac_code>${item.facCode}</fac_code><fac_name>시설</fac_name>` +
        `<rate>${String(item.rate)}</rate><water_level>1.0</water_level></item>`,
    )
    .join("");
  return (
    `<response><body>${body}<numOfRows>500</numOfRows><pageNo>${String(pageNo)}</pageNo>` +
    `<totalCount>${String(totalCount)}</totalCount></body>` +
    "<header><returnAuthMsg>NORMAL SERVICE</returnAuthMsg><returnReasonCode>00</returnReasonCode>" +
    "</header></response>"
  );
}

describe("fetchCountyWaterLevels", () => {
  it("시군 이름·최근 7일 구간으로 조회하고 60분 캐시를 지정한다", async () => {
    const fetchMock = vi.fn(async () =>
      xmlResponse(
        countyXml([{ facCode: "4420010001", date: "20260721", rate: 50 }], {
          pageNo: 1,
          totalCount: 1,
        }),
      ),
    );
    const result = await fetchCountyWaterLevels("아산시", makeDeps(fetchMock));

    expect(result.ok).toBe(true);
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      { next?: { revalidate?: number } } | undefined,
    ];
    expect(call[0]).toContain(`county=${encodeURIComponent("아산시")}`);
    expect(call[0]).toContain(`serviceKey=${ENCODED_KEY}`);
    expect(call[0]).not.toContain(RAW_KEY);
    // 지역 조회는 최대 31일 제한 — 7일(20260715~20260721)만 본다.
    expect(call[0]).toContain("date_s=20260715");
    expect(call[0]).toContain("date_e=20260721");
    expect(call[1]?.next?.revalidate).toBe(3600);
    expectKeyNeverLogged();
  });

  it("totalCount에 도달할 때까지 페이지를 이어 받는다", async () => {
    const fetchMock = vi
      .fn<WaterLevelFetch>()
      .mockResolvedValueOnce(
        xmlResponse(
          countyXml([{ facCode: "4420010001", date: "20260721", rate: 50 }], {
            pageNo: 1,
            totalCount: 2,
          }),
        ),
      )
      .mockResolvedValueOnce(
        xmlResponse(
          countyXml([{ facCode: "4420010002", date: "20260721", rate: 70 }], {
            pageNo: 2,
            totalCount: 2,
          }),
        ),
      );

    const result = await fetchCountyWaterLevels("아산시", makeDeps(fetchMock));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("성공이어야 한다");
    expect(result.observations.map((o) => o.facCode)).toEqual([
      "4420010001",
      "4420010002",
    ]);
  });

  it("중간 페이지가 실패하면 부분 집계 대신 전체를 버린다", async () => {
    const fetchMock = vi
      .fn<WaterLevelFetch>()
      .mockResolvedValueOnce(
        xmlResponse(
          countyXml([{ facCode: "4420010001", date: "20260721", rate: 50 }], {
            pageNo: 1,
            totalCount: 2,
          }),
        ),
      )
      .mockResolvedValueOnce(xmlResponse("server error", 500));

    const result = await fetchCountyWaterLevels("아산시", makeDeps(fetchMock));
    expect(result.ok).toBe(false);
    expectKeyNeverLogged();
  });

  it("NO_DATA(99) 응답이면 ok=false", async () => {
    const fetchMock = vi.fn(async () =>
      xmlResponse(
        "<response><header><returnAuthMsg>NO_DATA</returnAuthMsg>" +
          "<returnReasonCode>99</returnReasonCode></header></response>",
      ),
    );
    const result = await fetchCountyWaterLevels("아산시", makeDeps(fetchMock));
    expect(result.ok).toBe(false);
  });

  it("시군 이름이 비어 있으면 fetch를 호출하지 않는다", async () => {
    const fetchMock = vi.fn(async () => xmlResponse(sampleXml));
    const result = await fetchCountyWaterLevels("", makeDeps(fetchMock));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
