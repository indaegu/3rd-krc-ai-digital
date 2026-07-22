import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REGION_STORE_KEY } from "../lib/client/region-store";
import { ConsentSheet } from "./ConsentSheet";

// next/link는 라우터 컨텍스트를 참조하므로 page.test와 동일하게 스텁한다.
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

function readConsent(): string | null {
  const raw = window.localStorage.getItem(REGION_STORE_KEY);
  if (raw === null) {
    return null;
  }
  return (JSON.parse(raw) as { consentVersion: string | null }).consentVersion;
}

function seedConsented() {
  window.localStorage.setItem(
    REGION_STORE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      consentVersion: "consent-v1",
      regions: [],
      currentIndex: 0,
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConsentSheet", () => {
  it("필수 2건이 미체크면 '동의하고 시작하기'가 비활성이다", () => {
    render(<ConsentSheet />);

    expect(
      screen.getByRole("button", { name: "동의하고 시작하기" }),
    ).toBeDisabled();
  });

  it("필수 항목마다 해당 폴리시(/policy/*) 문서 링크를 제공한다", () => {
    render(<ConsentSheet />);

    expect(
      screen.getByRole("link", { name: "위치기반 서비스 약관 보기" }),
    ).toHaveAttribute("href", "/policy/location");
    expect(
      screen.getByRole("link", { name: "서비스 이용약관 보기" }),
    ).toHaveAttribute("href", "/policy/terms");
    expect(
      screen.getByRole("link", { name: "개인정보 처리방침 보기" }),
    ).toHaveAttribute("href", "/policy/privacy");
  });

  it("'모두 동의합니다'로 필수 항목을 한 번에 켜고 다시 끌 수 있다", () => {
    render(<ConsentSheet />);
    const agree = screen.getByRole("button", { name: "동의하고 시작하기" });
    const all = screen.getByRole("button", { name: /모두 동의/ });

    expect(agree).toBeDisabled();

    fireEvent.click(all);
    expect(agree).toBeEnabled();

    fireEvent.click(all);
    expect(agree).toBeDisabled();
  });

  it("동의를 완료하면 consentVersion='consent-v1'을 저장하고 onConsented를 호출하며 시트를 닫는다", () => {
    const onConsented = vi.fn();
    render(<ConsentSheet onConsented={onConsented} />);

    fireEvent.click(screen.getByRole("button", { name: /모두 동의/ }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 시작하기" }));

    expect(readConsent()).toBe("consent-v1");
    expect(onConsented).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("이미 동의한 재방문 사용자에게는 시트를 표시하지 않는다", () => {
    seedConsented();

    render(<ConsentSheet />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("동의 전에는 딤을 눌러도 시트가 닫히지 않는다", () => {
    render(<ConsentSheet />);

    const dialog = screen.getByRole("dialog");
    const dim = dialog.previousElementSibling as HTMLElement;
    fireEvent.click(dim);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
