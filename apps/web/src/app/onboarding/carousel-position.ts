// 가로 스냅 캐러셀에서 "지금 보이는 슬라이드"를 고르는 순수 함수.
//
// 슬라이드 폭에 gap이 붙어 있어 scrollLeft를 폭으로 나누면 끝으로 갈수록 어긋난다.
// 각 슬라이드의 실제 위치를 받아 가운데가 화면 가운데에 가장 가까운 것을 고른다.

/** 슬라이드 한 장의 배치. DOM의 offsetLeft·offsetWidth를 그대로 넣는다. */
export type SlideBox = {
  offsetLeft: number;
  offsetWidth: number;
};

/**
 * 지금 보이는 슬라이드 번호(0부터). 슬라이드가 없으면 0이다.
 *
 * 동률이면 앞선 슬라이드를 고른다 — 절반씩 걸쳐 있을 때 표시점이 깜빡이지 않게 한다.
 */
export function activeSlideIndex(
  scrollLeft: number,
  clientWidth: number,
  slides: readonly SlideBox[],
): number {
  if (slides.length === 0) return 0;

  const viewportCenter = scrollLeft + clientWidth / 2;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [index, slide] of slides.entries()) {
    const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
    const distance = Math.abs(slideCenter - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}
