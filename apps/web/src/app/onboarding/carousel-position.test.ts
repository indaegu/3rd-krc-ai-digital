import { describe, expect, it } from "vitest";

import { activeSlideIndex } from "./carousel-position";

/** 폭 360, 간격 16인 3장 캐러셀. 실제 화면과 같은 배치다. */
const SLIDES = [
  { offsetLeft: 0, offsetWidth: 360 },
  { offsetLeft: 376, offsetWidth: 360 },
  { offsetLeft: 752, offsetWidth: 360 },
];

describe("activeSlideIndex", () => {
  it("스냅된 위치마다 그 슬라이드를 고른다", () => {
    expect(activeSlideIndex(0, 360, SLIDES)).toBe(0);
    expect(activeSlideIndex(376, 360, SLIDES)).toBe(1);
    expect(activeSlideIndex(752, 360, SLIDES)).toBe(2);
  });

  it("끝까지 밀어도 마지막 슬라이드를 고른다", () => {
    // scrollLeft를 폭으로 나누는 방식은 gap 때문에 끝에서 어긋난다.
    expect(activeSlideIndex(760, 360, SLIDES)).toBe(2);
  });

  it("절반쯤 넘긴 중간 위치는 가까운 쪽을 고른다", () => {
    expect(activeSlideIndex(150, 360, SLIDES)).toBe(0);
    expect(activeSlideIndex(250, 360, SLIDES)).toBe(1);
  });

  it("슬라이드가 없으면 0이다", () => {
    expect(activeSlideIndex(0, 360, [])).toBe(0);
  });
});
