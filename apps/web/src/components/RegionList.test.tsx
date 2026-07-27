import type { StatusResponse } from "@mulsigye/contracts";
import {
  act,
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
    highWaterNotice: false,
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

/** 관리 모드 진입 — 길게 누르기를 흉내내는 대신 접근성 진입점을 쓴다(같은 상태로 간다). */
async function enterManageMode() {
  const entries = await screen.findAllByRole("button", { name: /지역 관리$/ });
  const first = entries[0];
  if (first === undefined) throw new Error("지역 관리 버튼이 없다");
  fireEvent.click(first);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("RegionList 빈 상태", () => {
  it("등록 지역이 없으면 아무 것도 그리지 않고 status를 호출하지 않는다", async () => {
    const fetchMock = stubStatusFetch();

    // 빈 상태 안내 카드는 두지 않는다(페이지의 "지역 추가하기"만 보이면 충분하다).
    const { container } = render(<RegionList />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    expect(screen.queryByText("아직 등록한 지역이 없어요.")).toBeNull();
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

  // 저장된 선택 저수지를 넘기지 않으면 목록이 시군 기본 저수지 이름을 보여줘 메인과 달라진다.
  it("저장된 저수지(facCode)를 status 조회에 함께 보낸다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    const fetchMock = stubStatusFetch();

    render(<RegionList />);
    await screen.findByRole("button", { name: /탑정/ });

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(
      urls.some((url) => url.includes(`facCode=${REGION_A.facCode}`)),
    ).toBe(true);
    expect(
      urls.some((url) => url.includes(`facCode=${REGION_B.facCode}`)),
    ).toBe(true);
  });

  it("삭제 버튼은 지역 이름이 든 접근 가능한 이름을 갖고 확인 뒤에만 지운다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    await enterManageMode();

    fireEvent.click(screen.getByRole("button", { name: "논산시 삭제" }));
    // 확인 전에는 아직 지워지지 않는다 — 잘못 눌러 지운 지역은 주소부터 다시 찾아야 한다.
    expect(readStore().regions).toEqual([REGION_A, REGION_B]);

    fireEvent.click(screen.getByRole("button", { name: "지우기" }));

    await waitFor(() =>
      expect(screen.queryByText(/탑정/)).not.toBeInTheDocument(),
    );
    expect(readStore().regions).toEqual([REGION_B]);
    expect(screen.getByText("산청군")).toBeInTheDocument();
  });

  it("삭제 확인에서 '그대로 두기'를 누르면 지우지 않는다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    await enterManageMode();

    fireEvent.click(screen.getByRole("button", { name: "논산시 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "그대로 두기" }));

    expect(readStore().regions).toEqual([REGION_A, REGION_B]);
    expect(screen.getByText("논산시")).toBeInTheDocument();
  });

  it("현재 선택된 지역을 삭제하면 currentIndex를 보정한다", async () => {
    seedStore([REGION_A, REGION_B], 1);
    stubStatusFetch();

    render(<RegionList />);
    await enterManageMode();

    fireEvent.click(screen.getByRole("button", { name: "산청군 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));

    await waitFor(() => {
      const stored = readStore();
      expect(stored.regions).toEqual([REGION_A]);
      expect(stored.currentIndex).toBe(0);
    });
    const first = await screen.findByRole("button", { name: /탑정/ });
    expect(first).toHaveAttribute("aria-pressed", "true");
  });
});

// product.md #3b: 관리 모드는 길게 눌러 들어가고, 드래그의 접근성 대체로 위로/아래로 이동을 준다.
describe("RegionList 관리 모드", () => {
  it("일반 모드에는 관리 버튼이 보이지 않는다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    await screen.findByRole("button", { name: /탑정/ });

    expect(screen.queryByRole("button", { name: "논산시 삭제" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "산청군 위로 이동" }),
    ).toBeNull();
  });

  it("항목을 길게 누르면 관리 모드로 들어가고 그 누름은 선택으로 치지 않는다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    const second = await screen.findByRole("button", { name: /차황/ });

    fireEvent.pointerDown(second);
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(second);
    fireEvent.click(second);

    expect(
      screen.getByRole("button", { name: "산청군 위로 이동" }),
    ).toBeInTheDocument();
    // 길게 누른 항목이 선택으로 바뀌면 관리하려다 지역이 바뀐다.
    expect(readStore().currentIndex).toBe(0);
  });

  it("짧게 누르면 관리 모드로 들어가지 않고 선택만 바뀐다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    const second = await screen.findByRole("button", { name: /차황/ });

    fireEvent.pointerDown(second);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerUp(second);
    fireEvent.click(second);

    expect(readStore().currentIndex).toBe(1);
    expect(screen.queryByRole("button", { name: "산청군 삭제" })).toBeNull();
  });

  it("키보드 사용자는 숨은 '지역 관리' 버튼으로 같은 곳에 들어간다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    const enter = await screen.findByRole("button", {
      name: "논산시 지역 관리",
    });
    fireEvent.click(enter);

    expect(
      screen.getByRole("button", { name: "산청군 위로 이동" }),
    ).toBeInTheDocument();
  });

  it("위로 이동은 순서를 바꾸고 맨 위가 기본 주소지가 된다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    await enterManageMode();

    fireEvent.click(screen.getByRole("button", { name: "산청군 위로 이동" }));

    expect(readStore().regions).toEqual([REGION_B, REGION_A]);
    // 선택은 "칸"이 아니라 "지역"을 따라간다 — 논산을 보고 있었으면 계속 논산이다.
    expect(readStore().currentIndex).toBe(1);
    expect(screen.getByText("기본 주소지")).toBeInTheDocument();
  });

  it("맨 위 항목의 위로 이동과 기본 주소지 지정은 눌리지 않는다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    await enterManageMode();

    expect(
      screen.getByRole("button", { name: "논산시 위로 이동" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "산청군 아래로 이동" }),
    ).toBeDisabled();
  });

  it("별 버튼은 그 지역을 맨 위로 올린다", async () => {
    seedStore([REGION_A, REGION_B], 0);
    stubStatusFetch();

    render(<RegionList />);
    await enterManageMode();

    fireEvent.click(
      screen.getByRole("button", { name: "산청군을(를) 기본 주소지로" }),
    );

    expect(readStore().regions).toEqual([REGION_B, REGION_A]);
    expect(readStore().currentIndex).toBe(0);
  });
});
