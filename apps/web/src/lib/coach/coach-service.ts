// /api/v1/coach 오케스트레이션 — 서버 전용, **정적 코치 전용**(단계 3 플랜 Task 7).
// packages/llm AGENTS.md 규칙: 캐시·lock·예산 가드 없이 Anthropic provider를 공개
// Route Handler에 연결하지 않는다. 이 모듈은 어떤 경로로도 Anthropic을 호출하지
// 않으며, LLM_ENABLED env 분기 자체를 두지 않는다 — 실수로 live가 열릴 여지를
// 없앤다. live 연결은 캐시·lock·예산 가드가 자동 테스트되는 별도 변경 몫이다.
// 행동 ID·순서·카피는 서버(카탈로그·CoachPolicy)가 확정한다(AGENTS 규칙 10).
import type { CoachResponse } from "@mulsigye/contracts";
import {
  ACTION_CATALOG_VERSION,
  PROMPT_VERSION,
  selectActions,
  StaticCoachProvider,
} from "@mulsigye/llm";
import { buildStatus, type StatusServiceDeps } from "../data/status-service.ts";
import {
  buildForecast,
  type ForecastServiceDeps,
} from "../prediction/forecast-service.ts";
import { buildCoachFactPacket } from "./coach-context.ts";

export type CoachServiceDeps = {
  status?: StatusServiceDeps;
  forecast?: ForecastServiceDeps;
  now?: () => Date;
};

export type CoachResult =
  | { kind: "ok"; body: CoachResponse }
  | { kind: "not_prepared" }
  | { kind: "unavailable" };

/** 정적 provider 단일 인스턴스 — 이 경로가 실행하는 유일한 CoachProvider다. */
const staticCoachProvider = new StaticCoachProvider();

/**
 * sigunCode 하나로 status·forecast를 조립해 정적 코치 CoachResponse를 만든다.
 * HTTP 매핑은 라우트가 맡는다(ok / not_prepared / unavailable).
 */
export async function buildCoach(
  sigunCode: string,
  deps: CoachServiceDeps = {},
): Promise<CoachResult> {
  const now = deps.now ?? (() => new Date());
  // 하위 서비스 deps에 now가 없으면 코치의 now를 물려준다(동일 기준시각).
  const [statusResult, forecastResult] = await Promise.all([
    buildStatus(sigunCode, { now, ...(deps.status ?? {}) }),
    buildForecast(sigunCode, { now, ...(deps.forecast ?? {}) }),
  ]);

  if (
    statusResult.kind === "not_prepared" ||
    forecastResult.kind === "not_prepared"
  ) {
    return { kind: "not_prepared" };
  }
  // 패킷은 단계(status)와 버킷(forecast)을 모두 요구한다 — 한쪽만 죽어도 조립 불가.
  if (statusResult.kind !== "ok" || forecastResult.kind !== "ok") {
    return { kind: "unavailable" };
  }
  const status = statusResult.body;
  const forecast = forecastResult.body;

  // 만수위 참고는 status가 서버에서 확정한 highWaterNotice를 그대로 쓴다 —
  // 수위 시계열을 다시 조회하거나 재판정하지 않는다(중복 rateSeriesFor 제거).
  const base = buildCoachFactPacket({
    status,
    forecast,
    now: now(),
  });
  const facts = {
    ...base,
    actions: selectActions(base.officialStage, base.highWaterNotice),
  };

  // 정적 provider는 카탈로그 카피만 반환하며 validator를 통과한다.
  const copy = await staticCoachProvider.generate(facts);

  // title은 항상 서버 카탈로그에서 결합한다 — LLM/provider 산출물에 title 없음.
  const titleById = new Map(
    facts.actions.map((action) => [action.id, action.approvedTitle]),
  );
  const actions = copy.actions.map(({ id, reason }) => {
    const title = titleById.get(id);
    if (title === undefined) {
      throw new Error(`행동 카탈로그에 없는 ID: ${id}`);
    }
    return { id, title, reason };
  });

  const dataStale = status.stale || forecast.stale;
  const generatedAt = now().toISOString();
  const body: CoachResponse = {
    schemaVersion: "1",
    mode: "static",
    dataStale,
    cacheHit: false,
    generatedAt,
    promptVersion: PROMPT_VERSION,
    actionCatalogVersion: ACTION_CATALOG_VERSION,
    coach: {
      headline: copy.headline,
      summary: copy.summary,
      actions,
    },
    fallbackReason: "disabled",
    asOf: generatedAt,
    sources: [...new Set([...status.sources, ...forecast.sources])],
    stale: dataStale,
  };
  return { kind: "ok", body };
}
