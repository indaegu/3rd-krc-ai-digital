// 단계 색 토큰 가드 — globals.css의 값을 직접 읽어 검사한다.
//
// 시안 팔레트(`--{stage}-fg`)는 물·차트처럼 큰 면적에는 좋지만 글자 색으로 쓰면 흰 배경 대비가
// 1.5~3.6:1로 WCAG AA(본문 4.5:1)에 크게 못 미친다. 1차 타깃이 고령 농업인이라 읽히지 않으면
// 안 되므로 글자 전용 `--{stage}-text` 토큰을 따로 둔다(design-system.md).
//
// 이 테스트가 막는 것 두 가지.
//   1) text 토큰이 흰 배경·틴트 배경 모두에서 4.5:1 미만으로 내려가는 것
//   2) 컴포넌트가 글자 색에 fg 토큰을 (다시) 쓰는 것 — 게이지 물처럼 그래픽만 fg를 쓴다

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const STAGES = ["ok", "watch", "care", "alert", "crit"] as const;

const COMPONENTS_DIR = join(process.cwd(), "src", "components");

function readGlobals(): string {
  return readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
}

/** `--ok-text: #0064f5;` → "0064f5". 없으면 명시적으로 실패하도록 빈 문자열. */
function token(css: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6})`).exec(css);
  return match?.[1] ?? "";
}

/** WCAG 상대 휘도. */
function luminance(hex: string): number {
  const channels = [0, 2, 4]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4),
    );
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("단계 글자 색 — WCAG AA 가드", () => {
  const css = readGlobals();

  for (const stage of STAGES) {
    it(`${stage}: 글자 색이 흰 배경·틴트 배경 모두 4.5:1 이상이다`, () => {
      const text = token(css, `${stage}-text`);
      const tint = token(css, `${stage}-bg`);
      expect(text, `--${stage}-text 토큰이 없다`).toMatch(/^[0-9a-fA-F]{6}$/);
      expect(tint, `--${stage}-bg 토큰이 없다`).toMatch(/^[0-9a-fA-F]{6}$/);
      expect(contrast(text, "ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, tint)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("그래픽용 fg 토큰은 5단계 모두 정의돼 있다(물·차트가 시안 팔레트를 쓴다)", () => {
    for (const stage of STAGES) {
      expect(token(css, `${stage}-fg`)).toMatch(/^[0-9a-fA-F]{6}$/);
    }
  });
});

describe("단계 색 사용처 — 글자에는 fg를 쓰지 않는다", () => {
  /** 게이지 물·물결만 시안 팔레트(fg)를 쓴다. 그 밖의 파일은 글자 색이라 text를 써야 한다. */
  const GRAPHICS_ONLY = new Set(["ReservoirGauge.module.css"]);

  const cssFiles = readdirSync(COMPONENTS_DIR).filter((name) =>
    name.endsWith(".module.css"),
  );

  it("컴포넌트 CSS를 실제로 읽었다(경로가 바뀌면 이 테스트가 헛돌지 않게)", () => {
    expect(cssFiles.length).toBeGreaterThan(5);
  });

  for (const file of cssFiles) {
    it(`${file}: color/fill로 fg 토큰을 쓰지 않는다`, () => {
      const css = readFileSync(join(COMPONENTS_DIR, file), "utf8");
      const offenders = STAGES.filter((stage) =>
        new RegExp(`(?:color|fill):\\s*var\\(--${stage}-fg\\)`).test(css),
      );
      expect(
        offenders,
        `${file}에서 글자 색에 fg를 썼다: ${offenders.join(", ")}`,
      ).toEqual([]);
    });

    if (GRAPHICS_ONLY.has(file)) continue;

    it(`${file}: 배경/획으로도 fg 토큰을 쓰지 않는다(그래픽은 게이지만)`, () => {
      const css = readFileSync(join(COMPONENTS_DIR, file), "utf8");
      const offenders = STAGES.filter((stage) =>
        new RegExp(`var\\(--${stage}-fg\\)`).test(css),
      );
      expect(offenders).toEqual([]);
    });
  }
});
