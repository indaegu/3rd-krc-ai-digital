import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ApiError, StatusResponse } from "@mulsigye/contracts";
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

const STATUS_UNAVAILABLE: ApiError = {
  code: "status_unavailable",
  message: "저수지 상태를 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  retryable: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(<HomePage />);

    expect(await screen.findByText("불러오는 중…")).toBeInTheDocument();
    expect(screen.queryByText("우리 지역 대표 저수지")).not.toBeInTheDocument();

    resolveFetch(jsonResponse(NORMAL));

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
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(STALE))),
    );

    render(<HomePage />);

    expect(
      await screen.findByText(
        `${STALE.region.observedOn} 기준 · 지연된 정보예요`,
      ),
    ).toBeInTheDocument();
  });
});

describe("메인 오류·재시도", () => {
  it("503이면 재시도 버튼을 보여주고, 재시도로 복구한다", async () => {
    seedRegion();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(STATUS_UNAVAILABLE, 503))
      .mockResolvedValueOnce(jsonResponse(NORMAL));
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    expect(
      await screen.findByText(STATUS_UNAVAILABLE.message),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));

    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("메인 로고 새로고침", () => {
  it("로고를 누르면 status를 다시 요청한다", async () => {
    seedRegion();
    // Response 본문은 1회만 읽을 수 있어 호출마다 새 Response를 만든다.
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(NORMAL)));
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText(String(NORMAL.reservoir.rate)),
    ).toBeInTheDocument();
  });
});
