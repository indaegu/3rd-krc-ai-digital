// GET /api/v1/health — 공개 API 프로세스가 요청을 받을 수 있는지 확인한다.
//
// 상류를 부르지 않는 가장 싼 경로지만, 그래서 가장 두들기기 쉬운 경로이기도 하다.
// 호출 한 번마다 서버리스 실행이 하나 붙으므로 여기에도 상한을 둔다. 감시 도구는
// 보통 분당 한 번이라 넉넉한 값으로도 정상 사용을 막지 않는다.
import type { HealthResponse } from "@mulsigye/contracts";

import {
  clientKey,
  createRateLimiter,
  type RateLimiter,
} from "../../../../lib/api/rate-limit.ts";
import {
  beginRequest,
  okJson,
  tooManyRequestsJson,
} from "../../../../lib/api/respond.ts";

export const dynamic = "force-dynamic";

/** 감시 도구(분당 1회)와 사람이 몇 번 눌러보는 정도를 모두 담고도 남는 값. */
const HEALTH_LIMIT_PER_MINUTE = 60;

const defaultLimiter = createRateLimiter({
  limit: HEALTH_LIMIT_PER_MINUTE,
  windowMs: 60_000,
});

export function createHealthResponse(now: Date): HealthResponse {
  return {
    schemaVersion: "1",
    service: "mulsigye-api",
    status: "ok",
    asOf: now.toISOString(),
    sources: [],
    stale: false,
  };
}

type HealthHandlerDeps = {
  rateLimiter?: RateLimiter;
  now?: () => Date;
};

export function createHealthHandler(deps: HealthHandlerDeps = {}) {
  return function handleHealth(request: Request): Response {
    const context = beginRequest("/api/v1/health");

    const verdict = (deps.rateLimiter ?? defaultLimiter).check(
      clientKey(request),
    );
    if (!verdict.allowed) {
      return tooManyRequestsJson(context, verdict.retryAfterSeconds);
    }

    const now = deps.now ?? (() => new Date());
    return okJson(context, createHealthResponse(now()));
  };
}

export const GET = createHealthHandler();
