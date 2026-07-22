import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CtaButton } from "./CtaButton";

afterEach(cleanup);

describe("CtaButton", () => {
  it("기본 상태에서는 클릭을 전달한다", () => {
    const onClick = vi.fn();
    render(<CtaButton onClick={onClick}>등록하기</CtaButton>);

    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("busy 상태에서는 클릭을 무시하고 잠금 상태를 알린다", () => {
    const onClick = vi.fn();
    render(
      <CtaButton onClick={onClick} busy>
        등록하기
      </CtaButton>,
    );

    const button = screen.getByRole("button", { name: "등록하기" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  it("disabled 상태에서도 클릭이 전달되지 않는다", () => {
    const onClick = vi.fn();
    render(
      <CtaButton onClick={onClick} disabled>
        등록하기
      </CtaButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
