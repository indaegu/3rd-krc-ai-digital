import type { ForecastResponse } from "@mulsigye/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EarlyWarningBanner } from "./EarlyWarningBanner";

type EarlyWarning = ForecastResponse["earlyWarning"];

const SET: EarlyWarning = {
  level: "watch",
  dailyDelta: -0.82,
  message:
    "저수율이 빠르게 줄고 있어요. 지금은 괜찮아도 미리 대비하면 좋아요. 공식 단계와 별개인 참고 신호예요.",
};

/** 예측 단정 금지 표현(AGENTS.md 규칙 3). */
const FORBIDDEN_COPY = /내려가요|됩니다|위험합니다|발생합니다/;

afterEach(() => {
  cleanup();
});

describe("EarlyWarningBanner", () => {
  it("earlyWarning이 있으면 서버 message와 '참고 조기경보' 라벨을 보여준다", () => {
    const { container } = render(<EarlyWarningBanner earlyWarning={SET} />);

    expect(screen.getByText("참고 조기경보")).toBeInTheDocument();
    expect(container.textContent).toContain(SET?.message);
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY);
  });

  it("공식 단계 칩과 구분되는 watch 톤(참고 신호)임을 문구로 명시한다", () => {
    const { container } = render(<EarlyWarningBanner earlyWarning={SET} />);

    // 공식 '단계'와 별개인 참고 신호임을 문구가 밝힌다(단계 칩으로 오인 방지).
    expect(container.textContent).toContain("공식 단계와 별개인 참고 신호");
  });

  it("earlyWarning이 null이면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<EarlyWarningBanner earlyWarning={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("earlyWarning이 undefined(구 페이로드)여도 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <EarlyWarningBanner earlyWarning={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
