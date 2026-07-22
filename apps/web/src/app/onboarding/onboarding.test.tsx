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
});
