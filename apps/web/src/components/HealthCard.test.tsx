import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HealthCard } from "./HealthCard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HealthCard", () => {
  it("shows the connected state from the shared health API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: "1",
            service: "mulsigye-api",
            status: "ok",
            asOf: "2026-07-19T00:00:00.000Z",
            sources: [],
            stale: false,
          }),
          { status: 200 },
        ),
      ),
    );

    render(<HealthCard />);

    expect(screen.getByText("물시계를 준비하고 있어요.")).toBeInTheDocument();
    expect(
      await screen.findByText("물시계 서버와 연결됐어요."),
    ).toBeInTheDocument();
  });

  it("offers an explicit retry when the API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<HealthCard />);

    expect(
      await screen.findByRole("button", { name: "다시 시도하기" }),
    ).toBeInTheDocument();
  });
});
