// KST 날짜 문자열 → 계절 — 결정적 순수 함수(Date.now 금지, 날짜는 호출자가 주입).
// 판정: KST 월 기준 3–5 봄 / 6–8 여름 / 9–11 가을 / 12–2 겨울 (단계 3 플랜 확정).

export type Season = "spring" | "summer" | "autumn" | "winter";

/** "YYYY-MM-DD"(KST) → 계절. 형식·월 범위가 어긋나면 명시적 에러. */
export function seasonOf(kstDate: string): Season {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(kstDate);
  const month = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`KST 날짜 형식(YYYY-MM-DD)이 아니다: ${kstDate}`);
  }
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}
