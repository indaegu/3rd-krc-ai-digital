import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ForecastResponse } from "@mulsigye/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReachCard } from "./ReachCard";

// packages/contracts/examples의 계약 정합 데모 픽스처를 그대로 재사용한다.
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

const WATCH = loadExample<ForecastResponse>("forecast.watch-demo.json");
const SEVERE = loadExample<ForecastResponse>("forecast.severe-demo.json");
const NORMAL = loadExample<ForecastResponse>("forecast.normal-demo.json");

/** 예측 단정 금지 표현(AGENTS.md 규칙 3, product.md 카피 규칙). */
const FORBIDDEN_COPY = /내려가요|됩니다|위험합니다|발생합니다/;

afterEach(() => {
  cleanup();
});

describe("ReachCard 도달 예상 3케이스", () => {
  it("가뭄 진행(18일·주의): 참고 표현 카피로 도달 예상을 보여준다", () => {
    const { container } = render(<ReachCard forecast={WATCH} />);

    expect(screen.getByText("이 추세라면")).toBeInTheDocument();
    expect(container.textContent).toContain("18일 뒤");
    expect(container.textContent).toContain(
      "지금 추세가 이어지면 ‘주의’ 단계에 들어설 가능성이 있어요",
    );
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY);
  });

  it("심각 임박(9일·심각): 참고 표현 카피로 도달 예상을 보여준다", () => {
    const { container } = render(<ReachCard forecast={SEVERE} />);

    expect(container.textContent).toContain("9일 뒤");
    expect(container.textContent).toContain(
      "지금 추세가 이어지면 ‘심각’ 단계에 들어설 가능성이 있어요",
    );
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY);
  });

  it("정상(days null): '안정'을 보여주고 도달일 문구를 만들지 않는다", () => {
    const { container } = render(<ReachCard forecast={NORMAL} />);

    expect(screen.getByText("안정")).toBeInTheDocument();
    expect(container.textContent).not.toContain("일 뒤");
    expect(container.textContent).not.toContain("들어설 가능성");
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY);
  });
});

describe("ReachCard 예측 오차 캡션 — model 메타 실값(하드코딩 금지)", () => {
  it("픽스처의 mae7/mae14 값을 소수 1자리로 보여준다", () => {
    const { container } = render(<ReachCard forecast={WATCH} />);

    // pred-v1: mae7 1.9168 → ±1.9%p, mae14 2.8337 → ±2.8%p
    expect(container.textContent).toContain("7일 ±1.9%p");
    expect(container.textContent).toContain("14일 ±2.8%p");
  });

  it("model 값이 바뀌면 캡션도 함께 바뀐다(하드코딩 검사)", () => {
    const changed: ForecastResponse = {
      ...WATCH,
      model: { ...WATCH.model, mae7: 4.7, mae14: 6.3 },
    };
    const { container } = render(<ReachCard forecast={changed} />);

    expect(container.textContent).toContain("7일 ±4.7%p");
    expect(container.textContent).toContain("14일 ±6.3%p");
    expect(container.textContent).not.toContain("±1.9%p");
    expect(container.textContent).not.toContain("±2.8%p");
  });
});
