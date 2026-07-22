// 브라우저 전용 API 클라이언트 — /api/v1/*만 호출한다(docs/architecture.md).
// 서버 컴포넌트·Route Handler에서 import 금지(서버는 서비스 모듈을 직접 쓴다).
// 검색어·주소 원문은 요청에만 쓰고 어디에도 저장하지 않는다.

import type {
  ApiError,
  CoachResponse,
  ForecastResponse,
  RegionResolveRequest,
  RegionResolveResponse,
  RegionSearchResponse,
  StatusResponse,
} from "@mulsigye/contracts";

export interface ApiFailure {
  kind: "error";
  code: string;
  message: string;
  retryable: boolean;
}

export type ApiResult<T> = { kind: "ok"; data: T } | ApiFailure;

interface RequestOptions {
  signal?: AbortSignal;
}

const NETWORK_ERROR_MESSAGE =
  "서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
const UNKNOWN_ERROR_MESSAGE = "잠시 문제가 생겼어요. 다시 시도해 주세요.";

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    typeof record.message === "string" &&
    typeof record.retryable === "boolean"
  );
}

async function toFailure(response: Response): Promise<ApiFailure> {
  try {
    const body: unknown = await response.json();
    if (isApiError(body)) {
      return {
        kind: "error",
        code: body.code,
        message: body.message,
        retryable: body.retryable,
      };
    }
  } catch {
    // ApiError 본문이 아니면 상태 코드로 재시도 가능 여부를 정한다.
  }
  return {
    kind: "error",
    code: "unknown_error",
    message: UNKNOWN_ERROR_MESSAGE,
    retryable: response.status >= 500,
  };
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    // 네트워크 예외(오프라인·중단 등)는 재시도 가능으로 본다.
    return {
      kind: "error",
      code: "network_error",
      message: NETWORK_ERROR_MESSAGE,
      retryable: true,
    };
  }

  if (!response.ok) {
    return toFailure(response);
  }

  try {
    return { kind: "ok", data: (await response.json()) as T };
  } catch {
    return {
      kind: "error",
      code: "invalid_response",
      message: UNKNOWN_ERROR_MESSAGE,
      retryable: true,
    };
  }
}

function baseInit(options?: RequestOptions): RequestInit {
  const init: RequestInit = {};
  if (options?.signal) {
    init.signal = options.signal;
  }
  return init;
}

export function getStatus(
  sigunCode: string,
  options?: RequestOptions,
): Promise<ApiResult<StatusResponse>> {
  return requestJson<StatusResponse>(
    `/api/v1/status?sigunCode=${encodeURIComponent(sigunCode)}`,
    baseInit(options),
  );
}

export function getForecast(
  sigunCode: string,
  options?: RequestOptions,
): Promise<ApiResult<ForecastResponse>> {
  return requestJson<ForecastResponse>(
    `/api/v1/forecast?sigunCode=${encodeURIComponent(sigunCode)}`,
    baseInit(options),
  );
}

export function getCoach(
  sigunCode: string,
  options?: RequestOptions,
): Promise<ApiResult<CoachResponse>> {
  return requestJson<CoachResponse>(
    `/api/v1/coach?sigunCode=${encodeURIComponent(sigunCode)}`,
    baseInit(options),
  );
}

export function searchRegions(
  q: string,
  options?: RequestOptions,
): Promise<ApiResult<RegionSearchResponse>> {
  return requestJson<RegionSearchResponse>(
    `/api/v1/regions/search?q=${encodeURIComponent(q)}`,
    baseInit(options),
  );
}

export function resolveRegion(
  request: RegionResolveRequest,
  options?: RequestOptions,
): Promise<ApiResult<RegionResolveResponse>> {
  return requestJson<RegionResolveResponse>("/api/v1/regions/resolve", {
    ...baseInit(options),
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}
