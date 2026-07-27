import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import OnboardingPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("온보딩", () => {
  it("3장의 소개 슬라이드를 보여준다", () => {
    render(<OnboardingPage />);

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
  });

  it("가입 없이 시작한다는 안내를 보여준다", () => {
    render(<OnboardingPage />);

    expect(screen.getByText("가입 없이 바로 시작해요")).toBeInTheDocument();
  });

  it("'내 지역 설정하기'를 누르면 /regions로 이동한다", () => {
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole("button", { name: "내 지역 설정하기" }));

    expect(routerMock.push).toHaveBeenCalledWith("/regions");
  });

  // 표시점이 항상 첫 장에 멈춰 있으면 몇 장이 남았는지 알 수 없다.
  it("처음에는 첫 번째 표시점만 현재 위치다", () => {
    render(<OnboardingPage />);

    const dots = screen.getAllByRole("button", { name: /번째 소개 보기$/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("aria-current", "true");
    expect(dots[1]).not.toHaveAttribute("aria-current");
    expect(dots[2]).not.toHaveAttribute("aria-current");
  });

  it("캐러셀을 넘기면 현재 표시점이 따라 옮겨간다", () => {
    render(<OnboardingPage />);

    const carousel = screen.getByRole("list", { name: "수신호 소개" });
    // jsdom은 레이아웃을 계산하지 않으므로 슬라이드 배치를 직접 심는다.
    Object.defineProperty(carousel, "clientWidth", { value: 360 });
    Array.from(carousel.children).forEach((child, index) => {
      Object.defineProperty(child, "offsetLeft", { value: index * 376 });
      Object.defineProperty(child, "offsetWidth", { value: 360 });
    });

    carousel.scrollLeft = 376;
    fireEvent.scroll(carousel);

    const dots = screen.getAllByRole("button", { name: /번째 소개 보기$/ });
    expect(dots[1]).toHaveAttribute("aria-current", "true");
    expect(dots[0]).not.toHaveAttribute("aria-current");
  });

  it("표시점을 누르면 그 슬라이드로 옮겨간다", () => {
    render(<OnboardingPage />);

    const carousel = screen.getByRole("list", { name: "수신호 소개" });
    Object.defineProperty(carousel, "clientWidth", { value: 360 });
    Array.from(carousel.children).forEach((child, index) => {
      Object.defineProperty(child, "offsetLeft", { value: index * 376 });
      Object.defineProperty(child, "offsetWidth", { value: 360 });
    });

    fireEvent.click(screen.getByRole("button", { name: "3번째 소개 보기" }));

    expect(carousel.scrollLeft).toBe(752);
    const dots = screen.getAllByRole("button", { name: /번째 소개 보기$/ });
    expect(dots[2]).toHaveAttribute("aria-current", "true");
  });
});
