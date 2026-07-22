import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CoachResponse } from "@mulsigye/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CoachCard } from "./CoachCard";

// packages/contracts/examples의 계약 정합 픽스처를 그대로 재사용한다.
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

const COACH = loadExample<CoachResponse>("coach.static.json");

/** 자유 채팅/입력을 암시하는 UI가 없어야 한다(spec 15절·규칙 10). */
function expectNoChatAffordance(container: HTMLElement): void {
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(container.textContent ?? "").not.toContain("물어보기");
  expect(container.textContent ?? "").not.toContain("질문");
  expect(container.textContent ?? "").not.toContain("입력");
}

afterEach(() => {
  cleanup();
});

describe("CoachCard 물시계 코치 카드", () => {
  it("헤더·headline·summary·행동 3개(번호+제목+보조설명)를 보여준다", () => {
    const { container } = render(
      <CoachCard state={{ kind: "ready", data: COACH }} />,
    );

    expect(screen.getByText("물시계 코치")).toBeInTheDocument();
    expect(container.textContent).toContain(COACH.coach.headline);
    expect(container.textContent).toContain(COACH.coach.summary);

    const items = container.querySelectorAll("ol > li");
    expect(items).toHaveLength(3);
    COACH.coach.actions.forEach((action, index) => {
      const item = items[index];
      expect(item).toBeDefined();
      expect(item?.textContent).toContain(String(index + 1));
      expect(item?.textContent).toContain(action.title);
      expect(item?.textContent).toContain(action.reason);
    });
  });

  it("행동이 3개를 넘어도 최대 3개만 보여준다", () => {
    const many: CoachResponse = {
      ...COACH,
      coach: {
        ...COACH.coach,
        actions: [
          ...COACH.coach.actions,
          {
            id: "extra_action",
            title: "네 번째 행동",
            reason: "표시되면 안 돼요",
          },
        ],
      },
    };
    const { container } = render(
      <CoachCard state={{ kind: "ready", data: many }} />,
    );

    expect(container.querySelectorAll("ol > li")).toHaveLength(3);
    expect(container.textContent).not.toContain("네 번째 행동");
  });

  it("mode가 llm·cache·static 3값 모두에서 DOM 구조가 동일하다", () => {
    const html = (mode: CoachResponse["mode"]): string => {
      const { container } = render(
        <CoachCard state={{ kind: "ready", data: { ...COACH, mode } }} />,
      );
      const markup = container.innerHTML;
      cleanup();
      return markup;
    };

    const llm = html("llm");
    const cache = html("cache");
    const staticHtml = html("static");

    expect(llm).toBe(cache);
    expect(cache).toBe(staticHtml);
  });

  it("fallbackReason이 달라도 표시 차이를 만들지 않는다", () => {
    const html = (fallbackReason: CoachResponse["fallbackReason"]): string => {
      const { container } = render(
        <CoachCard
          state={{ kind: "ready", data: { ...COACH, fallbackReason } }}
        />,
      );
      const markup = container.innerHTML;
      cleanup();
      return markup;
    };

    expect(html(null)).toBe(html("provider_error"));
    expect(html("provider_error")).toBe(html("budget_exceeded"));
  });

  it("정상 카드에는 채팅/입력 암시 UI가 없다", () => {
    const { container } = render(
      <CoachCard state={{ kind: "ready", data: COACH }} />,
    );
    expectNoChatAffordance(container);
  });

  it("coach 503이면 모듈만 오류 카드로 대체하고 채팅 암시 UI가 없다", () => {
    const { container } = render(
      <CoachCard
        state={{
          kind: "error",
          message: "코치 설명을 잠시 불러오지 못했어요.",
          retryable: true,
        }}
      />,
    );

    // 코치 본문(headline·행동)은 사라지고 오류 카드만 남는다.
    expect(container.textContent).not.toContain(COACH.coach.headline);
    expect(container.querySelector("ol")).toBeNull();
    expect(container.textContent).toContain(
      "코치 설명을 잠시 불러오지 못했어요.",
    );
    expectNoChatAffordance(container);
  });
});
