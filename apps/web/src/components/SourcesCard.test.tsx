import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SourcesCard } from "./SourcesCard";

afterEach(() => {
  cleanup();
});

describe("SourcesCard 근거 고지 모듈", () => {
  it("공인 기준 70·60·50·40% 설명과 공식 우선 문구를 보여준다", () => {
    const { container } = render(
      <SourcesCard sources={["논가뭄지도"]} stale={false} />,
    );

    expect(screen.getByText("이 정보는 어디서 왔나요")).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).toContain("70");
    expect(text).toContain("60");
    expect(text).toContain("50");
    expect(text).toContain("40");
    expect(text).toContain("공인");
    expect(text).toContain("공식 가뭄 예·경보가 항상 우선");
  });

  it("sources 칩을 전달받은 값 그대로 보여준다(status ∪ forecast 합침 결과)", () => {
    // 페이지는 status ∪ forecast sources를 중복 제거해 넘긴다.
    const { rerender } = render(
      <SourcesCard
        sources={["농촌용수 저수지 수위정보 조회", "논가뭄지도"]}
        stale={false}
      />,
    );
    expect(
      screen.getByText("농촌용수 저수지 수위정보 조회"),
    ).toBeInTheDocument();
    expect(screen.getByText("논가뭄지도")).toBeInTheDocument();

    // 하드코딩이 아니라 전달받은 값을 그대로 반영한다.
    rerender(
      <SourcesCard sources={["가뭄예경보", "저수지 시설제원"]} stale={false} />,
    );
    expect(screen.getByText("가뭄예경보")).toBeInTheDocument();
    expect(screen.getByText("저수지 시설제원")).toBeInTheDocument();
    expect(screen.queryByText("논가뭄지도")).toBeNull();
  });

  it("stale일 때만 지연 안내를 덧붙인다(화면 구조는 유지)", () => {
    const { container, rerender } = render(
      <SourcesCard
        sources={["농촌용수 저수지 수위정보 조회", "논가뭄지도"]}
        stale={false}
      />,
    );
    expect(container.textContent).not.toContain("지연");

    rerender(
      <SourcesCard sources={["Supabase 스냅샷", "논가뭄지도"]} stale={true} />,
    );
    expect(container.textContent).toContain("지연");
  });

  it("추정으로 계산한 날에만 서버가 준 근거(저수지 수·오차)를 밝힌다", () => {
    const { container, rerender } = render(
      <SourcesCard sources={["논가뭄지도"]} stale={false} estimate={null} />,
    );
    expect(container.textContent).not.toContain("추정값이에요");

    rerender(
      <SourcesCard
        sources={["논가뭄지도", "저수지 실측 기반 지역 추정"]}
        stale={false}
        estimate={{ maePp: 0.65, reservoirCount: 25, capacityRatio: 1 }}
      />,
    );
    const text = container.textContent ?? "";
    // 숫자는 하드코딩이 아니라 서버 값에서만 온다.
    expect(text).toContain("25곳");
    expect(text).toContain("0.7%p");
    expect(text).toContain("추정값이에요");
    // 임계값은 공인 기준 그대로임을 함께 밝힌다.
    expect(text).toContain("공인 기준 그대로");
  });
});
