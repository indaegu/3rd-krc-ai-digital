import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  ApiError,
  CoachResponse,
  ForecastResponse,
  NearbyResponse,
  StatusResponse,
} from "@mulsigye/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearCoachCache } from "../lib/client/api-client";
import { REGION_STORE_KEY } from "../lib/client/region-store";
import HomePage from "./page";

// 게이팅(/onboarding replace)을 검증하기 위한 next/navigation mock.
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

function loadExample<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "packages",
        "contracts",
        "examples",
        name,
      ),
      "utf8",
    ),
  ) as T;
}

const NORMAL = loadExample<StatusResponse>("status.normal-demo.json");
const STALE = loadExample<StatusResponse>("status.stale.json");
const FORECAST_NORMAL = loadExample<ForecastResponse>(
  "forecast.normal-demo.json",
);
const COACH_STATIC = loadExample<CoachResponse>("coach.static.json");

const STATUS_UNAVAILABLE: ApiError = {
  code: "status_unavailable",
  message: "저수지 상태를 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  retryable: true,
};

const FORECAST_UNAVAILABLE: ApiError = {
  code: "forecast_unavailable",
  message: "흐름 예측을 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  retryable: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * status·forecast·coach 병렬 페치를 URL로 라우팅하는 fetch 스텁.
 * 핸들러는 호출마다 새 Response를 만들어야 한다(본문 1회 읽기 제약).
 * coach는 비차단 모듈이라 지정하지 않으면 정적 코치 픽스처를 돌려준다.
 */
function stubApiFetch(handlers: {
  status: () => Response | Promise<Response>;
  forecast?: () => Response | Promise<Response>;
  coach?: () => Response | Promise<Response>;
  nearby?: () => Response | Promise<Response>;
}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/v1/forecast")) {
      return Promise.resolve(
        (handlers.forecast ?? (() => jsonResponse(FORECAST_NORMAL)))(),
      );
    }
    if (url.includes("/api/v1/coach")) {
      return Promise.resolve(
        (handlers.coach ?? (() => jsonResponse(COACH_STATIC)))(),
      );
    }
    if (url.includes("/api/v1/regions/nearby")) {
      // 주변 비교는 비차단 — 지정 없으면 감춰지도록 404를 돌려준다.
      return Promise.resolve(
        (handlers.nearby ?? (() => jsonResponse({}, 404)))(),
      );
    }
    return Promise.resolve(handlers.status());
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NEARBY_OK: NearbyResponse = {
  schemaVersion: "1",
  sidoName: "충남",
  asOf: "2025-12-31",
  regions: [
    {
      sigunCode: "44270",
      sigunName: "당진시",
      avgRatio: 71.9,
      stageCode: "ok",
      current: false,
    },
    {
      sigunCode: "44230",
      sigunName: "논산시",
      avgRatio: 112.7,
      stageCode: "ok",
      current: true,
    },
  ],
  stale: true,
  sources: ["커밋 스냅샷(기준 2025-12-31)"],
};

function seedRegion() {
  window.localStorage.setItem(
    REGION_STORE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      consentVersion: "consent-v1",
      regions: [{ sigunCode: "44230", facCode: "4423010045" }],
      currentIndex: 0,
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // 코치 응답은 모듈 레벨 캐시에 남아 테스트 간 페치 횟수를 흐트러뜨린다 — 매 테스트 초기화한다.
  clearCoachCache();
  // jsdom에는 matchMedia가 없다 — reduced motion으로 스텁해 장식 모션을 끈다.
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("메인 게이팅", () => {
  it("동의 이력이 없으면 /onboarding으로 replace하고 status를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/onboarding"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("동의는 했지만 등록 지역이 없으면 /regions로 replace한다", async () => {
    window.localStorage.setItem(
      REGION_STORE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        consentVersion: "consent-v1",
        regions: [],
        currentIndex: 0,
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/regions"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("메인 로딩 → 데이터 전환", () => {
  it("로딩 중에는 '불러오는 중…'을 보여주고, 데이터가 오면 상태 모듈로 전환한다", async () => {
    seedRegion();
    let resolveStatus!: (response: Response) => void;
    stubApiFetch({
      status: () =>
        new Promise<Response>((resolve) => {
          resolveStatus = resolve;
        }),
    });

    render(<HomePage />);

    expect(await screen.findByText("불러오는 중…")).toBeInTheDocument();
    // 게이지 카드 탭 라벨(대표 저수지명)은 데이터 전에는 없다.
    expect(screen.queryByText(NORMAL.reservoir.name)).not.toBeInTheDocument();

    resolveStatus(jsonResponse(NORMAL));

    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    // 게이지 카드 탭 = 대표 저수지명.
    expect(screen.getByText(NORMAL.reservoir.name)).toBeInTheDocument();
    // asOf 2026-07-21T00:00:00Z → KST 오전 9:00
    expect(screen.getByText("오늘 오전 9:00 기준")).toBeInTheDocument();
    // 헤더 드롭다운 = 대표 시군명.
    expect(screen.getByText(NORMAL.sigunName)).toBeInTheDocument();
    // normal 픽스처는 만수위 배너를 보여주지 않는다.
    expect(screen.queryByText(/만수위에 가까워요/)).not.toBeInTheDocument();
  });

  it("stale 응답이면 관측일 기준 지연 문구를 보여준다", async () => {
    seedRegion();
    stubApiFetch({ status: () => jsonResponse(STALE) });

    render(<HomePage />);

    expect(
      await screen.findByText(
        `${STALE.region.observedOn} 기준 · 지연된 정보예요`,
      ),
    ).toBeInTheDocument();
  });
});

describe("메인 예측 모듈", () => {
  it("forecast가 오면 '이 추세라면'·흐름 차트·참고 고지를 보여준다", async () => {
    seedRegion();
    stubApiFetch({ status: () => jsonResponse(NORMAL) });

    render(<HomePage />);

    expect(await screen.findByText("이 추세라면")).toBeInTheDocument();
    // normal 데모: reach.days null → 안정.
    expect(screen.getByText("안정")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /지역 평년 대비 저수율/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "자세히" })).toHaveAttribute(
      "href",
      "/trend",
    );
    expect(
      screen.getByText("예측은 참고용이며 공식 가뭄 예·경보가 우선이에요."),
    ).toBeInTheDocument();
  });

  it("forecast 503이어도 status 모듈은 유지하고 예측 모듈만 오류 카드를 보여준다", async () => {
    seedRegion();
    stubApiFetch({
      status: () => jsonResponse(NORMAL),
      forecast: () => jsonResponse(FORECAST_UNAVAILABLE, 503),
    });

    render(<HomePage />);

    // status 모듈은 정상 렌더.
    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    expect(screen.getByText(NORMAL.reservoir.name)).toBeInTheDocument();
    // forecast 모듈만 오류 카드.
    expect(
      await screen.findByText("흐름 예측을 불러오지 못했어요"),
    ).toBeInTheDocument();
    expect(screen.getByText(FORECAST_UNAVAILABLE.message)).toBeInTheDocument();
    expect(screen.queryByText("이 추세라면")).not.toBeInTheDocument();
  });
});

describe("메인 코치·근거 모듈", () => {
  it("coach가 오면 수신호 코치와 근거 고지 모듈을 보여준다", async () => {
    seedRegion();
    stubApiFetch({ status: () => jsonResponse(NORMAL) });

    render(<HomePage />);

    expect(await screen.findByText("수신호 코치")).toBeInTheDocument();
    expect(screen.getByText(COACH_STATIC.coach.headline)).toBeInTheDocument();
    // 근거 고지 모듈 + status ∪ forecast sources 칩(중복 제거).
    expect(screen.getByText("이 정보는 어디서 왔나요")).toBeInTheDocument();
    const [firstStatusSource = ""] = NORMAL.sources;
    expect(screen.getByText(firstStatusSource)).toBeInTheDocument();
    // "논가뭄지도"는 status·forecast 양쪽에 있지만 칩은 한 번만 렌더된다.
    expect(screen.getAllByText("논가뭄지도")).toHaveLength(1);
    // 채팅 암시 UI는 없어야 한다(spec 15절).
    expect(screen.queryByText("코치에게 물어보기")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("coach 503이어도 status·forecast·근거 고지 카드는 유지하고 코치 모듈만 오류 카드가 된다", async () => {
    seedRegion();
    stubApiFetch({
      status: () => jsonResponse(NORMAL),
      coach: () =>
        jsonResponse(
          {
            code: "coach_unavailable",
            message: "코치 설명을 지금 불러오지 못했어요.",
            retryable: true,
          },
          503,
        ),
    });

    render(<HomePage />);

    // 다른 모듈은 정상 렌더.
    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    expect(await screen.findByText("이 추세라면")).toBeInTheDocument();
    // 코치 모듈만 오류 카드(헤더는 유지, 본문은 사라짐).
    expect(
      await screen.findByText("코치 설명을 지금 불러오지 못했어요."),
    ).toBeInTheDocument();
    expect(screen.getByText("수신호 코치")).toBeInTheDocument();
    expect(
      screen.queryByText(COACH_STATIC.coach.headline),
    ).not.toBeInTheDocument();
    // 근거 고지 카드는 coach 실패와 무관하게 status가 로드되면 항상 뜬다.
    expect(screen.getByText("이 정보는 어디서 왔나요")).toBeInTheDocument();
    const [firstStatusSource = ""] = NORMAL.sources;
    expect(screen.getByText(firstStatusSource)).toBeInTheDocument();
    // 공식 우선 규정 준수 문구도 함께 보인다.
    expect(
      screen.getByText(/공식 가뭄 예·경보가 항상 우선/),
    ).toBeInTheDocument();
  });
});

describe("메인 오류·재시도", () => {
  it("status 503이면 재시도 버튼을 보여주고, 재시도로 복구한다", async () => {
    seedRegion();
    let failStatusOnce = true;
    const fetchMock = stubApiFetch({
      status: () => {
        if (failStatusOnce) {
          failStatusOnce = false;
          return jsonResponse(STATUS_UNAVAILABLE, 503);
        }
        return jsonResponse(NORMAL);
      },
    });

    render(<HomePage />);

    expect(
      await screen.findByText(STATUS_UNAVAILABLE.message),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));

    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    // 병렬 페치: status+forecast+coach+nearby 4종을 2회씩 = 총 8회.
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});

describe("메인 새로고침", () => {
  it("기준 시각(새로고침)을 누르면 status·forecast·coach·주변 비교를 다시 요청한다", async () => {
    seedRegion();
    // Response 본문은 1회만 읽을 수 있어 호출마다 새 Response를 만든다.
    const fetchMock = stubApiFetch({ status: () => jsonResponse(NORMAL) });

    render(<HomePage />);

    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
  });
});

describe("메인 주변 지역 비교 모듈", () => {
  it("nearby가 오면 같은 시·도 목록·순위 요약·우리 지역 강조를 보여준다", async () => {
    seedRegion();
    stubApiFetch({
      status: () => jsonResponse(NORMAL),
      nearby: () => jsonResponse(NEARBY_OK),
    });

    render(<HomePage />);

    // 시·도 이름을 쓴 제목과 목록(가뭄 심한 순: 당진 → 논산).
    expect(await screen.findByText("충남 안에서 비교")).toBeInTheDocument();
    expect(screen.getByText("당진시")).toBeInTheDocument();
    // 논산시는 헤더 드롭다운(대표 시군명)과 주변 비교 목록 양쪽에 나타난다.
    expect(screen.getAllByText("논산시").length).toBeGreaterThanOrEqual(1);
    // 순위 요약: 논산(112.7)이 가장 넉넉 → 1번째.
    expect(screen.getByText("1번째")).toBeInTheDocument();
    // 우리 지역 강조 마커.
    expect(screen.getByText("우리 지역")).toBeInTheDocument();
    // 평년 대비 저수율 표시.
    expect(screen.getByText("평년 대비 71.9%")).toBeInTheDocument();
  });

  it("nearby 실패는 화면을 깨지 않고 카드만 조용히 감춘다(비차단)", async () => {
    seedRegion();
    stubApiFetch({
      status: () => jsonResponse(NORMAL),
      nearby: () => jsonResponse({}, 503),
    });

    render(<HomePage />);

    // 다른 모듈은 정상 렌더.
    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    // 주변 비교 카드는 뜨지 않는다.
    expect(screen.queryByText("충남 안에서 비교")).not.toBeInTheDocument();
  });
});
