import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { StatusResponse } from "@mulsigye/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HighWaterBanner } from "./HighWaterBanner";

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

const FLOOD = loadExample<StatusResponse>("status.flood-demo.json");
const NORMAL = loadExample<StatusResponse>("status.normal-demo.json");

afterEach(cleanup);

describe("HighWaterBanner", () => {
  it("flood 픽스처(highWaterNotice=true)에서만 '참고' 배너를 보여준다", () => {
    const { container } = render(
      <HighWaterBanner notice={FLOOD.highWaterNotice} />,
    );

    expect(screen.getByText("참고")).toBeInTheDocument();
    expect(screen.getByText(/만수위에 가까워요/)).toBeInTheDocument();
    // 홍수 안내는 공식 채널로 위임한다(product.md 만수위 참고 안내).
    expect(screen.getByText(/공식 재난 문자/)).toBeInTheDocument();
    // 독자적인 위험 판정처럼 보이는 단어를 쓰지 않는다.
    expect(container.textContent).not.toMatch(/경보|경고|위험/);
  });

  it("highWaterNotice=false(normal 픽스처)면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <HighWaterBanner notice={NORMAL.highWaterNotice} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
