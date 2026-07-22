// 단계 4 완료 게이트 테스트 (docs/work-plan.md 단계 4 "완료" 기준 중 자동화 가능분).
// 실제 화면 컴포넌트(메인 `/`·상세 `/trend`)를 렌더하되 fetch만 계약 정합 데모
// 픽스처로 스텁한다. 실 네트워크·Supabase·Anthropic 호출 금지.
//
// ① 4개 상태(정상·가뭄 진행·심각 임박·장마 만수위) 메인 전체 트리 렌더가
//    product.md 상태 표(rate·avgRatio·단계 칩·도달일·만수위 배너·행동 3개)와 일치.
// ② stale 픽스처(status.stale.json)에서 지연 안내 표시 + HTTP 200 경로 유지.
// ③ 카피 감사: 금지 단정 표현·"가까운 저수지"·알림·로그인 0건, 모든 예측 화면에
//    "공식 가뭄 예·경보가 우선" 고지 존재.
// ④ 접근성 자동화분: heading 레벨 순서, 아이콘 단독 버튼 접근 가능한 이름,
//    차트 aria-label, 인터랙티브 요소 키보드 접근, reduced-motion 분기.
//
// 수동 QA(375px·200% 확대·실기기·Vercel 프리뷰)는 코드로 대체할 수 없어
// docs/work-plan.md에 별도 미완 항목으로 남긴다.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";

import type {
  CoachResponse,
  ForecastResponse,
  StatusResponse,
} from "@mulsigye/contracts";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REGION_STORE_KEY } from "../src/lib/client/region-store";
import HomePage from "../src/app/page";
import TrendPage from "../src/app/trend/page";

// 게이팅(useRouter replace)을 위한 next/navigation mock — page.test와 동일 방식.
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

const COACH_STATIC = loadExample<CoachResponse>("coach.static.json");

interface Scenario {
  label: string;
  status: StatusResponse;
  forecast: ForecastResponse;
}

// 4개 상태 = product.md 상태 표와 산술 정합인 계약 픽스처 4벌.
const NORMAL: Scenario = {
  label: "정상",
  status: loadExample<StatusResponse>("status.normal-demo.json"),
  forecast: loadExample<ForecastResponse>("forecast.normal-demo.json"),
};
const WATCH: Scenario = {
  label: "가뭄 진행(관심)",
  status: loadExample<StatusResponse>("status.watch-demo.json"),
  forecast: loadExample<ForecastResponse>("forecast.watch-demo.json"),
};
const SEVERE: Scenario = {
  label: "심각 임박(경계)",
  status: loadExample<StatusResponse>("status.severe-demo.json"),
  forecast: loadExample<ForecastResponse>("forecast.severe-demo.json"),
};
const FLOOD: Scenario = {
  label: "장마 만수위",
  status: loadExample<StatusResponse>("status.flood-demo.json"),
  forecast: loadExample<ForecastResponse>("forecast.flood-demo.json"),
};
const SCENARIOS: readonly Scenario[] = [NORMAL, WATCH, SEVERE, FLOOD];

const STALE = loadExample<StatusResponse>("status.stale.json");

/** 예측을 사실로 단정하는 금지 표현(규칙 3, product.md 카피 규칙). */
const FORBIDDEN_ASSERTIONS = /내려가요|발생합니다|됩니다|위험합니다/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** status·forecast·coach 병렬 페치를 URL로 라우팅하는 fetch 스텁. */
function stubApiFetch(status: StatusResponse, forecast: ForecastResponse) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/v1/forecast")) {
      return Promise.resolve(jsonResponse(forecast));
    }
    if (url.includes("/api/v1/coach")) {
      return Promise.resolve(jsonResponse(COACH_STATIC));
    }
    return Promise.resolve(jsonResponse(status));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** /trend는 forecast만 페치한다. */
function stubForecastFetch(forecast: ForecastResponse) {
  const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(forecast)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function seedRegion(status: StatusResponse) {
  window.localStorage.setItem(
    REGION_STORE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      consentVersion: "consent-v1",
      regions: [
        { sigunCode: status.sigunCode, facCode: status.reservoir.facCode },
      ],
      currentIndex: 0,
    }),
  );
}

/** heading 레벨은 1에서 시작하고 이전 레벨 + 1을 넘지 않는다(건너뜀 금지). */
function assertHeadingOrder(container: HTMLElement) {
  const levels = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) =>
    Number(h.tagName[1]),
  );
  expect(levels.length).toBeGreaterThan(0);
  expect(levels[0]).toBe(1);
  let prev = 0;
  for (const level of levels) {
    expect(level).toBeLessThanOrEqual(prev + 1);
    prev = level;
  }
}

/** 모든 버튼은 접근 가능한 이름(aria-label 또는 텍스트)을 가진다. */
function assertButtonsNamed(container: HTMLElement) {
  for (const btn of container.querySelectorAll("button")) {
    const name =
      btn.getAttribute("aria-label")?.trim() ?? btn.textContent?.trim() ?? "";
    expect(name, `이름 없는 버튼: ${btn.outerHTML}`).not.toBe("");
  }
}

/** 인터랙티브 요소는 탭 순서에서 제외되지 않고, 링크는 href를 가진다. */
function assertKeyboardReachable(container: HTMLElement) {
  for (const el of container.querySelectorAll("a,button")) {
    const tabindex = el.getAttribute("tabindex");
    if (tabindex !== null) {
      expect(Number(tabindex)).toBeGreaterThanOrEqual(0);
    }
  }
  for (const link of container.querySelectorAll("a")) {
    expect(link.getAttribute("href")).toBeTruthy();
  }
}

/** 카피 감사 — 렌더된 텍스트에 금지 표현·유도 문구가 없는지 확인. */
function assertCopyClean(container: HTMLElement) {
  const text = container.textContent ?? "";
  expect(text).not.toMatch(FORBIDDEN_ASSERTIONS);
  expect(text).not.toMatch(/가까운 저수지/);
  expect(text).not.toMatch(/알림/);
  expect(text).not.toMatch(/로그인/);
}

beforeEach(() => {
  window.localStorage.clear();
  routerMock.replace.mockClear();
  // jsdom에는 matchMedia가 없다 — 기본은 reduced motion으로 스텁해 장식 모션을 끈다.
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// ① 4개 상태 메인 전체 트리 렌더 — product.md 상태 표 정합
// ─────────────────────────────────────────────────────────────────────────────

describe("단계 4 게이트 ① — 4개 상태 메인 전체 트리", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.label}: rate·avgRatio·단계·도달일·만수위·행동 3개가 상태 표와 일치한다`, async () => {
      seedRegion(scenario.status);
      stubApiFetch(scenario.status, scenario.forecast);

      const { container } = render(createElement(HomePage));

      // rate(대표 저수지 원저수율) — 카운트업은 reduced motion에서 최종 값 즉시 표시.
      const rate = scenario.status.reservoir.rate;
      expect(rate).not.toBeNull();
      expect(await screen.findByText(String(rate))).toBeInTheDocument();

      // avgRatio(지역 평년 대비) + 단계 칩 라벨.
      expect(
        screen.getByText(`${scenario.status.region.avgRatio}%`),
      ).toBeInTheDocument();
      // 단계 칩의 라벨은 <strong>이다. 차트 임계선 라벨(SVG text)과 겹치지 않게 스코프.
      expect(
        screen.getByText(scenario.status.region.officialStage.label, {
          selector: "strong",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("지역 평년 대비 기준")).toBeInTheDocument();

      // 도달일(이 추세라면).
      const reach = scenario.forecast.reach;
      if (reach.days !== null && reach.targetStage !== null) {
        expect(screen.getByText(String(reach.days))).toBeInTheDocument();
        const desc = screen.getByText(/단계에 들어설 가능성이 있어요/);
        expect(desc.textContent).toContain(reach.targetStage.label);
      } else {
        expect(screen.getByText("안정")).toBeInTheDocument();
      }

      // 만수위 참고 배너는 flood(highWaterNotice=true)에서만.
      if (scenario.status.highWaterNotice) {
        expect(screen.getByText(/만수위에 가까워요/)).toBeInTheDocument();
      } else {
        expect(screen.queryByText(/만수위에 가까워요/)).not.toBeInTheDocument();
      }

      // 물시계 코치 행동 3개(coach 카드의 ol 항목).
      expect(screen.getByText("물시계 코치")).toBeInTheDocument();
      expect(container.querySelectorAll("ol li")).toHaveLength(3);

      // 모든 예측 화면 공통 고지.
      expect(
        screen.getByText("예측은 참고용이며 공식 가뭄 예·경보가 우선이에요."),
      ).toBeInTheDocument();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ② stale 픽스처 — 지연 안내 + HTTP 200 경로 유지
// ─────────────────────────────────────────────────────────────────────────────

describe("단계 4 게이트 ② — 지연 폴백(stale)", () => {
  it("stale이면 지연 안내를 덧붙이고, 200 경로라 오류 카드로 바뀌지 않는다", async () => {
    seedRegion(STALE);
    stubApiFetch(STALE, NORMAL.forecast);

    render(createElement(HomePage));

    // 관측 기준일 + 지연 문구.
    expect(
      await screen.findByText(
        `${STALE.region.observedOn} 기준 · 지연된 정보예요`,
      ),
    ).toBeInTheDocument();
    // 근거 고지의 지연 안내.
    expect(screen.getByText(/일부 공공데이터가 지연되어/)).toBeInTheDocument();
    // HTTP 200 경로 유지: 상태 모듈은 그대로 뜨고 오류 카드로 대체되지 않는다.
    expect(screen.getByText("우리 지역 대표 저수지")).toBeInTheDocument();
    expect(
      screen.queryByText("지금은 물 사정을 불러오지 못했어요"),
    ).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ③ 카피 감사 — 금지 표현·유도 문구 0건, 공식 우선 고지 존재
// ─────────────────────────────────────────────────────────────────────────────

describe("단계 4 게이트 ③ — 카피 감사", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.label}: 금지 표현·유도 문구가 없고 공식 우선 고지가 있다`, async () => {
      seedRegion(scenario.status);
      stubApiFetch(scenario.status, scenario.forecast);

      const { container } = render(createElement(HomePage));

      await screen.findByText("물시계 코치");

      assertCopyClean(container);
      // 예측 표시 화면에는 공식 우선 고지가 있어야 한다.
      expect(container.textContent).toContain("공식 가뭄 예·경보가");
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ④ 접근성 자동화분 — heading·버튼 이름·차트 aria·키보드·reduced-motion
// ─────────────────────────────────────────────────────────────────────────────

describe("단계 4 게이트 ④ — 접근성 자동화분", () => {
  it("메인: heading 순서·버튼 이름·차트 aria·키보드 접근이 모두 성립한다", async () => {
    seedRegion(WATCH.status); // 도달일이 있는 가뭄 진행 상태.
    stubApiFetch(WATCH.status, WATCH.forecast);

    const { container } = render(createElement(HomePage));

    await screen.findByText("물시계 코치");

    assertHeadingOrder(container);
    assertButtonsNamed(container);
    assertKeyboardReachable(container);
    // 차트 aria-label.
    expect(
      screen.getByRole("img", { name: /지역 평년 대비 저수율/ }),
    ).toBeInTheDocument();
  });

  it("reduced-motion 스텁이면 수위 애니메이션 클래스가 적용되지 않고 카운트업이 최종 값이다", async () => {
    seedRegion(NORMAL.status);
    stubApiFetch(NORMAL.status, NORMAL.forecast);

    const { container } = render(createElement(HomePage));

    // 카운트업은 즉시 최종 값(0에서 애니메이션하지 않음).
    expect(
      await screen.findByText(String(NORMAL.status.reservoir.rate)),
    ).toBeInTheDocument();
    // 게이지 물 출렁임 애니메이션은 정지 상태.
    const gauge = container.querySelector("[data-motion]");
    expect(gauge).not.toBeNull();
    expect(gauge?.getAttribute("data-motion")).toBe("reduced");
  });

  it("모션 허용(matchMedia matches=false)이면 게이지 애니메이션이 켜진다", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    seedRegion(NORMAL.status);
    stubApiFetch(NORMAL.status, NORMAL.forecast);

    const { container } = render(createElement(HomePage));

    // 모션 허용에서는 카운트업이 애니메이션하므로 rate 텍스트에 의존하지 않고,
    // 상태 모듈이 뜬 뒤 게이지의 data-motion만 확인한다.
    await screen.findByText("우리 지역 대표 저수지");
    await waitFor(() => {
      const gauge = container.querySelector("[data-motion]");
      expect(gauge?.getAttribute("data-motion")).toBe("flowing");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 상세 화면 /trend — 큰 차트·단계 기준·예측 방법·공식 전망
// ─────────────────────────────────────────────────────────────────────────────

describe("단계 4 게이트 — 흐름 상세 /trend", () => {
  it("제목·차트·가뭄 단계 기준 표·예측 방법·공식 전망을 보여준다", async () => {
    seedRegion(WATCH.status);
    stubForecastFetch(WATCH.forecast);

    const { container } = render(createElement(TrendPage));

    // 제목: "{시군명} 지역 평년 대비 저수율".
    const title = await screen.findByRole("heading", { level: 1 });
    expect(title.textContent).toContain(WATCH.forecast.sigunName);
    expect(title.textContent).toContain("지역 평년 대비 저수율");

    // 뒤로 링크 → /.
    const back = screen.getByRole("link", { name: "뒤로" });
    expect(back).toHaveAttribute("href", "/");

    // 큰 차트 aria-label.
    expect(
      screen.getByRole("img", { name: /지역 평년 대비 저수율/ }),
    ).toBeInTheDocument();

    // 가뭄 단계 기준 표 — 5단계 + 한 줄 행동.
    expect(screen.getByText("가뭄 단계 기준")).toBeInTheDocument();
    for (const line of [
      "평소처럼 관리하면 돼요",
      "물 사용을 조금씩 아껴요",
      "공동 급수 일정을 확인해요",
      "제한급수·대체수원을 준비해요",
      "관계기관 안내에 따라요",
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }

    // 예측 방법 — 4개 모델 + MAE 실값 + 공식 우선 고지.
    const method = screen
      .getByText("예측은 이렇게 계산해요")
      .closest("section");
    expect(method).not.toBeNull();
    const methodScope = within(method as HTMLElement);
    expect(
      methodScope.getByText(/전일 유지·평균·선형 추세·지수평활/),
    ).toBeInTheDocument();
    expect(
      methodScope.getByText(
        new RegExp(
          `±${WATCH.forecast.model.mae7.toFixed(1)}%p.*±${WATCH.forecast.model.mae14.toFixed(1)}%p`,
        ),
      ),
    ).toBeInTheDocument();
    expect(
      methodScope.getByText(/공식 가뭄 예·경보가 항상 우선/),
    ).toBeInTheDocument();

    // 공식 가뭄 전망 병기(officialOutlook 존재).
    expect(screen.getByText("공식 가뭄 전망")).toBeInTheDocument();
    const outlook = WATCH.forecast.officialOutlook;
    expect(outlook).toBeTruthy();
    if (outlook) {
      expect(
        screen.getByText(new RegExp(outlook.publishedOn)),
      ).toBeInTheDocument();
    }

    // 접근성·카피 감사.
    assertHeadingOrder(container);
    assertButtonsNamed(container);
    assertKeyboardReachable(container);
    assertCopyClean(container);
  });

  it("officialOutlook이 없으면 공식 가뭄 전망 섹션을 그리지 않는다", async () => {
    seedRegion(NORMAL.status);
    stubForecastFetch(NORMAL.forecast);

    render(createElement(TrendPage));

    await screen.findByText("가뭄 단계 기준");
    expect(screen.queryByText("공식 가뭄 전망")).not.toBeInTheDocument();
  });
});
