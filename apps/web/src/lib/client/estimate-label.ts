// 추정값 기준일 표기 — 웹·Android 공통 규칙의 웹 구현(Android: EstimateLabel.kt).
//
// 추정은 커버리지를 채우는 가장 최근 날짜로 계산하므로 **오늘이 아닐 수 있다**(최대 조회 창만큼
// 과거). 그런데도 배지에 늘 "오늘 추정"이라고 쓰면 며칠 지난 값을 오늘 값으로 읽게 된다
// (코드 리뷰 P1 지적). 그래서 기준일이 오늘이 아니면 날짜를 그대로 드러낸다.

/** UTC ISO 시각 → KST 달력일 `YYYY-MM-DD`. 기기 시간대와 무관하게 서버 시각으로만 판단한다. */
export function kstDateOf(isoInstant: string): string {
  const ms = Date.parse(isoInstant);
  if (Number.isNaN(ms)) return "";
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → "7월 26일". 고령 사용자 기준으로 숫자 슬래시 대신 한글 단위를 쓴다. */
export function koreanMonthDay(observedOn: string): string {
  const month = Number(observedOn.slice(5, 7));
  const day = Number(observedOn.slice(8, 10));
  if (!Number.isFinite(month) || !Number.isFinite(day)) return observedOn;
  return `${String(month)}월 ${String(day)}일`;
}

/**
 * 추정 배지 문구. 기준일이 서버 기준 오늘이면 "오늘 추정", 아니면 "7월 24일 추정".
 * 날짜는 서버 observedOn에서만 온다(클라이언트가 만들지 않는다).
 */
export function estimateBadgeLabel(observedOn: string, asOf: string): string {
  return observedOn === kstDateOf(asOf)
    ? "오늘 추정"
    : `${koreanMonthDay(observedOn)} 추정`;
}

/**
 * 공표값 경로의 기준일 배지. 논가뭄지도는 연 1회 갱신이라 추정을 못 쓰는 지역
 * (게이트 탈락 등)에서는 지역 값이 **몇 달 전 공표값**일 수 있다. 그런데도 화면 상단에는
 * "오늘 …시 기준"만 떠서 오늘 값처럼 읽혔다 — 기준일이 오늘이 아니면 배지로 밝힌다.
 * 오늘이면 배지가 필요 없어 null이다.
 */
export function officialBadgeLabel(
  observedOn: string,
  asOf: string,
): string | null {
  if (observedOn === kstDateOf(asOf)) return null;
  return `${koreanYearMonthDay(observedOn)} 공표 기준`;
}

/** `YYYY-MM-DD` → "2025년 12월 31일". 해가 다르면 연도까지 밝혀야 오해가 없다. */
export function koreanYearMonthDay(observedOn: string): string {
  const year = Number(observedOn.slice(0, 4));
  if (!Number.isFinite(year)) return observedOn;
  return `${String(year)}년 ${koreanMonthDay(observedOn)}`;
}
