// 공개 API 응답을 만드는 한 곳. 지금까지 라우트 8개가 각자 같은 헬퍼를 복사해 두고 있었다.
//
// 한 곳으로 모으면 (1) 캐시 헤더 규칙이 갈리지 않고 (2) 구조화 로그를 빠뜨릴 수 없다.
// 로그는 여기서만 나가므로, 라우트가 실수로 검색어나 주소를 로그에 넣을 방법이 없다.

import type { ApiError } from "@mulsigye/contracts";

import {
  logApiRequest,
  newRequestId,
  outcomeOf,
  sourceTag,
} from "../observability/api-log.ts";

/** 모든 공개 응답은 캐시하지 않는다. 원천 캐시는 fetch 계층이 맡는다. */
const NO_STORE = "no-store";

/** 한 요청의 처리 맥락. 라우트 시작에서 만들고 응답 헬퍼에 넘긴다. */
export type RequestContext = {
  route: string;
  requestId: string;
  startedAt: number;
};

/** 응답 본문 중 로그에 쓰는 부분. 나머지 필드는 로그로 나가지 않는다. */
type LoggableBody = {
  sources?: readonly string[];
  stale?: boolean;
};

/** 라우트 시작. 경로는 고정 문자열로 넘긴다(질의문자열을 넣으면 검색어가 로그에 섞인다). */
export function beginRequest(route: string): RequestContext {
  return { route, requestId: newRequestId(), startedAt: Date.now() };
}

function headersFor(
  context: RequestContext,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "Cache-Control": NO_STORE,
    // 사용자가 문제를 알려올 때 로그 줄을 찾기 위한 값. 무작위이며 저장하지 않는다.
    "X-Request-Id": context.requestId,
    ...extra,
  };
}

function emit(
  context: RequestContext,
  status: number,
  fields: { source?: string; fallback?: string; stale?: boolean },
): void {
  logApiRequest({
    requestId: context.requestId,
    route: context.route,
    status,
    outcome: outcomeOf(status),
    durationMs: Date.now() - context.startedAt,
    ...(fields.source === undefined ? {} : { source: fields.source }),
    ...(fields.fallback === undefined ? {} : { fallback: fields.fallback }),
    ...(fields.stale === undefined ? {} : { stale: fields.stale }),
  });
}

/**
 * 정상 응답. 본문의 sources·stale에서 로그 필드를 스스로 뽑는다 —
 * 라우트가 따로 적지 않아도 "어느 원천으로 답했는지"가 항상 남는다.
 */
export function okJson<T extends LoggableBody>(
  context: RequestContext,
  body: T,
  extra: { fallback?: string } = {},
): Response {
  const source =
    body.sources === undefined ? undefined : sourceTag(body.sources);
  emit(context, 200, {
    ...(source === undefined ? {} : { source }),
    ...(extra.fallback === undefined ? {} : { fallback: extra.fallback }),
    ...(body.stale === undefined ? {} : { stale: body.stale }),
  });
  return Response.json(body, { status: 200, headers: headersFor(context) });
}

/** 오류 응답. 폴백 필드에는 도메인 오류 코드를 남긴다(사용자 입력 원문이 아니다). */
export function errorJson(
  context: RequestContext,
  status: number,
  error: ApiError,
  extraHeaders: Record<string, string> = {},
): Response {
  emit(context, status, { fallback: error.code });
  return Response.json(error, {
    status,
    headers: headersFor(context, extraHeaders),
  });
}

/**
 * 속도 제한 초과 응답. 다시 시도할 수 있는 상태이므로 retryable=true이고,
 * 언제 다시 시도하면 되는지 Retry-After로 알려 준다.
 */
export function tooManyRequestsJson(
  context: RequestContext,
  retryAfterSeconds: number,
): Response {
  return errorJson(
    context,
    429,
    {
      code: "TOO_MANY_REQUESTS",
      message: "요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.",
      retryable: true,
    },
    { "Retry-After": String(retryAfterSeconds) },
  );
}
