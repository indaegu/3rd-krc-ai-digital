import type { StatusResponse } from "@mulsigye/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REGION_STORE_KEY,
  type StoredRegion,
} from "../lib/client/region-store";
import { RegionList } from "./RegionList";

const REGION_A: StoredRegion = { sigunCode: "44230", facCode: "4423010045" };
const REGION_B: StoredRegion = { sigunCode: "48860", facCode: "4886010001" };

function statusFixture(
  sigunCode: string,
  sigunName: string,
  facCode: string,
  reservoirName: string,
): StatusResponse {
  return {
    schemaVersion: "1",
    sigunCode,
    sigunName,
    reservoir: {
      facCode,
      name: reservoirName,
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
  };
}

const STATUS_BY_CODE: Record<string, StatusResponse> = {
  "44230": statusFixture("44230", "논산시", "4423010045", "탑정"),
  "48860": statusFixture("48860", "산청군", "4886010001", "차황"),
};

function stubStatusFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const match = /sigunCode=(\d{5})/.exec(url);
    const status = match?.[1] ? STATUS_BY_CODE[match[1]] : undefined;
    if (!status) {
      throw new Error(`unexpected url: ${url}`);
    }
    return Promise.resolve(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function seedStore(regions: StoredRegion[], currentIndex: number) {
  window.localStorage.setItem(
    REGION_STORE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      consentVersion: "consent-v1",
      regions,
      currentIndex,
    }),
  );
}

function readStore(): { regions: StoredRegion[]; currentIndex: number } {
  return JSON.parse(window.localStorage.getItem(REGION_STORE_KEY) ?? "{}") as {
    regions: StoredRegion[];
    currentIndex: number;
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("RegionList 빈 상태", () => {
  it("등록 지역이 없으면 빈 상태 카피를 보여주고 status를 호출하지 않는다", async () => {
    const fetchMock = stubStatusFetch();

    render(<RegionList />);

    expect(
      await screen.findByText("아직 등록한 지역이 없어요."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("RegionList 선택·삭제", () => {
  it("status 병렬 호출로 지역·대표 저수지 이름을 보여주고 선택을 전환한다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);

    const first = await screen.findByRole("button", { name: /탑정/ });
    const second = await screen.findByRole("button", { name: /차황/ });
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("논산시")).toBeInTheDocument();
    expect(screen.getByText("산청군")).toBeInTheDocument();

    fireEvent.click(second);

    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(readStore().currentIndex).toBe(1);
  });

  it("삭제 버튼은 지역 이름이 든 접근 가능한 이름을 갖고 해당 지역만 지운다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);

    const deleteButton = await screen.findByRole("button", {
      name: "논산시 삭제",
    });
    fireEvent.click(deleteButton);

    await waitFor(() =>
      expect(screen.queryByText(/탑정/)).not.toBeInTheDocument(),
    );
    expect(readStore().regions).toEqual([REGION_B]);
    expect(screen.getByText("산청군")).toBeInTheDocument();
  });

  it("현재 선택된 지역을 삭제하면 currentIndex를 보정한다", async () => {
    seedStore([REGION_A, REGION_B], 1);
    stubStatusFetch();

    render(<RegionList />);

    const deleteButton = await screen.findByRole("button", {
      name: "산청군 삭제",
    });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      const stored = readStore();
      expect(stored.regions).toEqual([REGION_A]);
      expect(stored.currentIndex).toBe(0);
    });
    const first = await screen.findByRole("button", { name: /탑정/ });
    expect(first).toHaveAttribute("aria-pressed", "true");
  });
});
