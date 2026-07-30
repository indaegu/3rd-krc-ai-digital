import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { REGION_STORE_KEY } from "../../lib/client/region-store";
import RegionsPage from "./page";

/** status 응답을 붙잡아 두었다가 원할 때 풀어 주는 fetch 스텁. */
function deferredStatusFetch() {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const body = {
    schemaVersion: "1",
    sigunCode: "44230",
    sigunName: "논산시",
    reservoir: {
      facCode: "4423010045",
      name: "탑정",
      rate: 63,
      waterLevel: 27.6,
      observedOn: "2026-07-30",
    },
    region: {
      observedOn: "2026-07-30",
      regionalRate: 60,
      normalRate: 63,
      avgRatio: 95.4,
      officialStage: { code: "ok", label: "정상" },
    },
    highWaterNotice: false,
    asOf: "2026-07-30T00:00:00.000Z",
    sources: [],
    stale: false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return () => release?.();
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    REGION_STORE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      consentVersion: "consent-v1",
      regions: [{ sigunCode: "44230", facCode: "4423010045" }],
      currentIndex: 0,
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("지역 설정 — 시작하기 버튼", () => {
  // 이름을 못 받은 상태로 들어가면 메인이 빈 채로 열리고, 실패하면 빈 화면에서 오류를 만난다.
  it("선택한 지역을 불러오는 동안에는 누를 수 없다", async () => {
    const release = deferredStatusFetch();
    render(<RegionsPage />);

    const cta = await screen.findByRole("button", {
      name: "지역을 불러오는 중이에요…",
    });
    expect(cta).toBeDisabled();

    release();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "시작하기" })).toBeEnabled(),
    );
  });

  it("등록된 지역이 없으면 버튼 자체가 없다", async () => {
    // 동의 이력은 남겨 둔다 — 지우면 동의 시트의 "동의하고 시작하기"가 함께 잡힌다.
    window.localStorage.setItem(
      REGION_STORE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        consentVersion: "consent-v1",
        regions: [],
        currentIndex: 0,
      }),
    );
    deferredStatusFetch();

    render(<RegionsPage />);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "시작하기" })).toBeNull(),
    );
  });
});
