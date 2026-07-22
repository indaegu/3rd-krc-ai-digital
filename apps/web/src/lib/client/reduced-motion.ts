// 브라우저 전용 모듈 — 장식 모션(카운트업·물 출렁임·rainfall)의 on/off 판단.
// jsdom 등 matchMedia가 없는 환경에서는 모션을 끄는 쪽(true)이 안전하다.

export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
