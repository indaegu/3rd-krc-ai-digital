import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  ApiError,
  RegionCandidate,
  RegionResolveResponse,
  RegionSearchResponse,
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
import { AddressSearch } from "./AddressSearch";

// 등록 후 /regions 복귀를 검증하기 위한 next/navigation mock.
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

// packages/contracts/examples의 계약 정합 픽스처를 그대로 재사용한다.
function loadExample<T>(name: string): T {
  // vitest 실행 cwd는 apps/web이다.
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

const SEARCH_OK = loadExample<RegionSearchResponse>("regions-search.ok.json");
const RESOLVE_OK = loadExample<RegionResolveResponse>(
  "regions-resolve.ok.json",
);
const RESOLVE_NOT_READY = loadExample<RegionResolveResponse>(
  "regions-resolve.not-ready.json",
);

const FIRST_CANDIDATE = SEARCH_OK.candidates[0];
if (!FIRST_CANDIDATE) {
  throw new Error("regions-search.ok.json 픽스처에 후보가 없습니다.");
}
const CANDIDATE: RegionCandidate = FIRST_CANDIDATE;

const SEARCH_UNAVAILABLE: ApiError = {
  code: "juso_unavailable",
  message: "주소 검색을 지금은 할 수 없어요.",
  retryable: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function searchAndPickCandidate() {
  fireEvent.change(screen.getByRole("textbox", { name: "도로명주소 검색" }), {
    target: { value: "시청길 22" },
  });
  const candidateButton = await screen.findByRole("button", {
    name: CANDIDATE.label,
  });
  fireEvent.click(candidateButton);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AddressSearch 해피패스", () => {
  it("검색 → 후보 선택 → 확정 카드 → 등록 → /regions 복귀", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.startsWith("/api/v1/regions/search")) {
        return jsonResponse(SEARCH_OK);
      }
      if (url === "/api/v1/regions/resolve") {
        return jsonResponse(RESOLVE_OK);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    render(<AddressSearch />);
    await searchAndPickCandidate();

    // 확정 카드: 주소 원문(후보 버튼과 별도로 한 번 더 표시) + 대표 저수지 명칭.
    await screen.findByText("이 주소로 등록할까요?");
    expect(screen.getAllByText(CANDIDATE.label)).toHaveLength(2);
    expect(screen.getByText(/우리 지역 대표 저수지/)).toHaveTextContent("탑정");

    // resolve 요청 본문은 코드 2개만 담는다(주소 원문 미전송).
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/regions/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          admCd: CANDIDATE.admCd,
          legalCode: CANDIDATE.legalCode,
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/regions"),
    );

    const raw = window.localStorage.getItem(REGION_STORE_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw ?? "{}") as {
      regions: Record<string, string>[];
      currentIndex: number;
    };
    expect(stored.regions).toEqual([
      { sigunCode: "44230", facCode: "4423010045" },
    ]);
    expect(stored.currentIndex).toBe(0);
  });

  it("등록 버튼은 중복 클릭을 잠근다(내부 스피너·중복 잠금)", async () => {
    stubFetch((url) => {
      if (url.startsWith("/api/v1/regions/search")) {
        return jsonResponse(SEARCH_OK);
      }
      return jsonResponse(RESOLVE_OK);
    });

    render(<AddressSearch />);
    await searchAndPickCandidate();
    await screen.findByText("이 주소로 등록할까요?");

    const registerButton = screen.getByRole("button", { name: "등록하기" });
    fireEvent.click(registerButton);
    fireEvent.click(registerButton);
    fireEvent.click(registerButton);

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/regions"),
    );
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
    expect(registerButton).toHaveAttribute("aria-busy", "true");

    const stored = JSON.parse(
      window.localStorage.getItem(REGION_STORE_KEY) ?? "{}",
    ) as { regions: unknown[] };
    expect(stored.regions).toHaveLength(1);
  });
});

describe("AddressSearch not-ready 처리", () => {
  it("prepared=false면 준비 중 안내를 보여주고 등록을 비활성화한다", async () => {
    stubFetch((url) => {
      if (url.startsWith("/api/v1/regions/search")) {
        return jsonResponse(SEARCH_OK);
      }
      return jsonResponse(RESOLVE_NOT_READY);
    });

    render(<AddressSearch />);
    await searchAndPickCandidate();

    await screen.findByText("이 지역은 아직 준비 중이에요");
    const registerButton = screen.getByRole("button", { name: "등록하기" });
    expect(registerButton).toBeDisabled();

    fireEvent.click(registerButton);
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(REGION_STORE_KEY)).toBeNull();
  });
});

describe("AddressSearch 오류 처리", () => {
  it("검색 503이면 오류 문구와 재시도 버튼을 보여주고, 재시도로 복구한다", async () => {
    let searchCalls = 0;
    stubFetch((url) => {
      if (url.startsWith("/api/v1/regions/search")) {
        searchCalls += 1;
        return searchCalls === 1
          ? jsonResponse(SEARCH_UNAVAILABLE, 503)
          : jsonResponse(SEARCH_OK);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    render(<AddressSearch />);
    fireEvent.change(screen.getByRole("textbox", { name: "도로명주소 검색" }), {
      target: { value: "시청길 22" },
    });

    await screen.findByText(SEARCH_UNAVAILABLE.message);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));

    await screen.findByRole("button", { name: CANDIDATE.label });
    expect(searchCalls).toBe(2);
  });
});

describe("AddressSearch 개인정보 최소 저장", () => {
  it("등록 후 localStorage에는 코드 2개만 있고 주소 원문·이름이 없다", async () => {
    stubFetch((url) => {
      if (url.startsWith("/api/v1/regions/search")) {
        return jsonResponse(SEARCH_OK);
      }
      return jsonResponse(RESOLVE_OK);
    });

    render(<AddressSearch />);
    await searchAndPickCandidate();
    await screen.findByText("이 주소로 등록할까요?");
    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/regions"),
    );

    const raw = window.localStorage.getItem(REGION_STORE_KEY);
    expect(raw).not.toBeNull();
    // 주소 원문·검색어·지역명·저수지명 미저장.
    expect(raw).not.toContain("시청길");
    expect(raw).not.toContain("나주시");
    expect(raw).not.toContain("송월동");
    expect(raw).not.toContain("논산시");
    expect(raw).not.toContain("탑정");

    const stored = JSON.parse(raw ?? "{}") as {
      regions: Record<string, unknown>[];
    };
    for (const region of stored.regions) {
      expect(Object.keys(region).sort()).toEqual(["facCode", "sigunCode"]);
    }
  });
});
