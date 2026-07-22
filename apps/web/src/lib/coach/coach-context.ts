// CoachContextBuilder — 상태(StatusResponse)·예측(ForecastResponse) 결과를
// 비식별 CoachFactPacket으로 조립하는 순수 함수(네트워크·Date.now 접근 금지,
// now는 호출자가 주입한다 — status-service deps.now 패턴과 동일).
// 비식별 계약(플랜 Global Constraints): sigunCode·지역명·주소·정확한 수치를
// 패킷에 넣지 않는다. 담는 값은 전부 닫힌 어휘(단계 라벨·계절·버킷·불리언)다.
// actions는 여기서 채우지 않는다 — coach-service가 selectActions로 확정한다.
import type { ForecastResponse, StatusResponse } from "@mulsigye/contracts";
import type { CoachFactPacket, Season as CoachSeason } from "@mulsigye/llm";
import { seasonOf, type Season } from "../prediction/season.ts";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** prediction/season.ts 영문 계절 → CoachFactPacket 한국어 계절. */
const SEASON_LABEL: Record<Season, CoachSeason> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};

/** UTC 시각 → KST 달력일 "YYYY-MM-DD" (waterlevel-api kstYmd와 동일 오프셋 규칙). */
export function kstDateOf(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export type CoachContextInput = {
  /**
   * 만수위 참고는 status가 서버에서 확정한 `highWaterNotice`를 그대로 옮긴다.
   * 여기서 수위 시계열을 재판정하지 않는다 — 판정 위치는 status-service 하나다.
   */
  status: StatusResponse;
  forecast: ForecastResponse;
  now: Date;
};

/** 상태·예측 사실 → 비식별 CoachFactPacket(actions 비움). */
export function buildCoachFactPacket(
  input: CoachContextInput,
): CoachFactPacket {
  return {
    factSchemaVersion: "1",
    officialStage: input.status.region.officialStage.label,
    season: SEASON_LABEL[seasonOf(kstDateOf(input.now))],
    reachBucket: input.forecast.reach.bucket,
    trendBucket: input.forecast.trend.bucket,
    highWaterNotice: input.status.highWaterNotice,
    // 승인 전망 코드 카탈로그는 live 연결 결정과 함께 확정 — 이번 단계 null 고정.
    officialOutlookCode: null,
    actions: [],
  };
}
