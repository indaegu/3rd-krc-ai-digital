import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  ApiError,
  CoachResponse,
  ForecastResponse,
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
    return Promise.resolve(handlers.status());
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

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
  // jsdom에는 matchMedia가 없다 — reduced motion으로 스텁해 장식 모션을 끈다.
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("메인 게이팅", () => {
  it("등록 지역이 없으면 /onboarding으로 replace하고 status를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/onboarding"),
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
    expect(screen.queryByText("우리 지역 대표 저수지")).not.toBeInTheDocument();

    resolveStatus(jsonResponse(NORMAL));

    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    expect(screen.getByText("우리 지역 대표 저수지")).toBeInTheDocument();
    // asOf 2026-07-21T00:00:00Z → KST 오전 9:00
    expect(screen.getByText("오늘 오전 9:00 기준")).toBeInTheDocument();
    expect(screen.getByText("논산시 · 탑정")).toBeInTheDocument();
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
    expect(screen.getByText("우리 지역 대표 저수지")).toBeInTheDocument();
    // forecast 모듈만 오류 카드.
    expect(
      await screen.findByText("흐름 예측을 불러오지 못했어요"),
    ).toBeInTheDocument();
    expect(screen.getByText(FORECAST_UNAVAILABLE.message)).toBeInTheDocument();
    expect(screen.queryByText("이 추세라면")).not.toBeInTheDocument();
  });
});

describe("메인 코치·근거 모듈", () => {
  it("coach가 오면 물시계 코치와 근거 고지 모듈을 보여준다", async () => {
    seedRegion();
    stubApiFetch({ status: () => jsonResponse(NORMAL) });

    render(<HomePage />);

    expect(await screen.findByText("물시계 코치")).toBeInTheDocument();
    expect(screen.getByText(COACH_STATIC.coach.headline)).toBeInTheDocument();
    // 근거 고지 모듈 + 응답 sources 칩.
    expect(screen.getByText("이 화면의 근거")).toBeInTheDocument();
    const [firstSource = ""] = COACH_STATIC.sources;
    expect(screen.getByText(firstSource)).toBeInTheDocument();
    // 채팅 암시 UI는 없어야 한다(spec 15절).
    expect(screen.queryByText("코치에게 물어보기")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("coach 503이어도 status·forecast는 유지하고 코치 모듈만 오류 카드를 보여준다", async () => {
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
    expect(screen.getByText("물시계 코치")).toBeInTheDocument();
    expect(
      screen.queryByText(COACH_STATIC.coach.headline),
    ).not.toBeInTheDocument();
    // coach 실패 시 근거 고지 모듈은 렌더하지 않는다(sources 미확보).
    expect(screen.queryByText("이 화면의 근거")).not.toBeInTheDocument();
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
    // 병렬 페치: status+forecast+coach 3종을 2회씩 = 총 6회.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe("메인 로고 새로고침", () => {
  it("로고를 누르면 status·forecast·coach를 다시 요청한다", async () => {
    seedRegion();
    // Response 본문은 1회만 읽을 수 있어 호출마다 새 Response를 만든다.
    const fetchMock = stubApiFetch({ status: () => jsonResponse(NORMAL) });

    render(<HomePage />);

    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
  });
});
