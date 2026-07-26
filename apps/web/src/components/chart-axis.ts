// 차트 x축 좌표계·날짜 눈금 규칙 — TrendChart와 ReservoirRateChart의 공용 출처.
//
// 두 차트가 같은 viewBox(640 폭)와 같은 여백을 쓰므로 눈금 규칙도 한 곳에 둔다.
// 간격은 '일' 수가 아니라 **라벨 폭**으로 정한다 — 구간이 44일에서 90일로 늘자 같은
// '7일 간격'이 화면에서 절반으로 좁아져 날짜가 겹쳤다(design-system.md 차트 날짜 눈금).

/** viewBox 고정(너비 100% 반응형) 좌표계와 안쪽 여백. */
export const WIDTH = 640;
export const PAD_LEFT = 34;
export const PAD_RIGHT = 12;
export const PAD_TOP = 14;
export const PAD_BOTTOM = 26;

/**
 * 라벨 하나가 차지하는 최소 가로 폭(viewBox 단위).
 * "12/31" 5자 × font-size 10 기준에 숨 쉴 틈을 더한 값이다.
 */
export const LABEL_SLOT = 46;

/** 눈금 간격으로 쓸 '보기 좋은' 일수 사다리. 필요한 최소 간격 이상인 첫 값을 쓴다. */
const NICE_STEP_DAYS: readonly number[] = [1, 2, 3, 7, 14, 21, 28, 35, 42, 56];

/** 그림 영역(라벨을 놓을 수 있는 가로 폭). */
export const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT;

/** 라벨 하나 폭(LABEL_SLOT)을 인덱스 간격으로 환산한다. */
export function labelMinGap(total: number): number {
  if (total <= 1) return 1;
  return LABEL_SLOT / (PLOT_WIDTH / (total - 1));
}

/**
 * 눈금으로 쓸 인덱스 목록 — 첫날·마지막날은 항상 넣고 사이를 일정 간격으로 끊는다.
 *
 * `minGap`은 **라벨이 겹치지 않으려면 몇 칸 이상 떨어져야 하는지**(인덱스 단위)이며,
 * 호출자가 실제 폭에서 계산해 넘긴다([labelMinGap]). 양 끝·'오늘' 라벨과 이 간격 안에
 * 드는 눈금은 글자가 포개지므로 뺀다. `todayIndex`가 없으면 -1을 넘긴다.
 */
export function dateTickIndices(
  total: number,
  todayIndex: number,
  minGap: number,
): number[] {
  if (total <= 0) return [];
  if (total === 1) return [0];
  const last = total - 1;
  const gap = Math.max(1, Math.ceil(minGap));
  const step = NICE_STEP_DAYS.find((candidate) => candidate >= gap) ?? gap;

  const ticks = new Set<number>([0]);
  for (let i = step; i < last; i += step) {
    if (Math.abs(i - todayIndex) < gap) continue;
    if (i < gap || last - i < gap) continue;
    ticks.add(i);
  }
  ticks.add(last);
  return [...ticks].sort((a, b) => a - b);
}

/** "YYYY-MM-DD" → "M/D"(앞자리 0 제거). 파싱 실패 시 원문 반환. */
export function formatMonthDay(observedOn: string): string {
  const parts = observedOn.split("-");
  const month = parts[1];
  const day = parts[2];
  if (month === undefined || day === undefined) return observedOn;
  return `${String(Number(month))}/${String(Number(day))}`;
}
