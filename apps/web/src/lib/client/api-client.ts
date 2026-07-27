// 브라우저 전용 API 클라이언트 — /api/v1/*만 호출한다(docs/architecture.md).
// 서버 컴포넌트·Route Handler에서 import 금지(서버는 서비스 모듈을 직접 쓴다).
// 검색어·주소 원문은 요청에만 쓰고 어디에도 저장하지 않는다.

import type {
  ApiError,
  CoachResponse,
  ForecastResponse,
  NearbyResponse,
  RegionResolveRequest,
  RegionResolveResponse,
  RegionSearchResponse,
  ReservoirSearchResponse,
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

// 코치 응답 클라이언트 캐시 — 반복 조회(메인↔상세 이동, 지역 왕복, 메인 재진입) 때
// /api/v1/coach를 매번 다시 부르지 않도록 성공 응답만 짧게 재사용한다.
// 모듈 레벨 Map은 페이지/컴포넌트보다 위에 있어 리마운트에도 살아남는다(클라이언트 전용).
// 사용자 새로고침(로고 탭·당겨서 새로고침)은 force로 캐시를 우회해 항상 신선 페치한다.
const COACH_CACHE_TTL_MS = 30 * 60 * 1000; // 30분 — 코치는 ~시간 단위 데이터라 안전한 값.

interface CoachCacheEntry {
  response: CoachResponse;
  fetchedAtMillis: number;
}

const coachCache = new Map<string, CoachCacheEntry>();

/** 테스트 전용: 모듈 레벨 코치 캐시를 비운다(테스트 간 격리). */
export function clearCoachCache(): void {
  coachCache.clear();
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
  options?: RequestOptions & {
    /** 사용자가 저수지 이름으로 직접 고른 시설코드. 있으면 그 저수지로 조회한다. */
    facCode?: string;
  },
): Promise<ApiResult<StatusResponse>> {
  const facCode = options?.facCode;
  const query =
    facCode === undefined || facCode === ""
      ? `?sigunCode=${encodeURIComponent(sigunCode)}`
      : `?sigunCode=${encodeURIComponent(sigunCode)}&facCode=${encodeURIComponent(facCode)}`;
  return requestJson<StatusResponse>(
    `/api/v1/status${query}`,
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

export async function getCoach(
  sigunCode: string,
  options?: RequestOptions & {
    force?: boolean;
    /** 선택 저수지. status와 같은 시설을 봐야 만수위 행동이 어긋나지 않는다. */
    facCode?: string;
  },
): Promise<ApiResult<CoachResponse>> {
  const facCode = options?.facCode;
  // 클라이언트 캐시 키에도 시설코드를 넣는다 — 저수지를 바꿨는데 이전 코치가 나오면 안 된다.
  const cacheKey =
    facCode === undefined ? sigunCode : `${sigunCode}:${facCode}`;
  if (!options?.force) {
    const cached = coachCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAtMillis < COACH_CACHE_TTL_MS) {
      return { kind: "ok", data: cached.response };
    }
  }
  const query =
    facCode === undefined || facCode === ""
      ? `?sigunCode=${encodeURIComponent(sigunCode)}`
      : `?sigunCode=${encodeURIComponent(sigunCode)}&facCode=${encodeURIComponent(facCode)}`;
  const result = await requestJson<CoachResponse>(
    `/api/v1/coach${query}`,
    baseInit(options),
  );
  // 성공만 캐시한다(오류는 절대 캐시하지 않는다). force여도 신선 성공은 캐시를 갱신한다.
  if (result.kind === "ok") {
    coachCache.set(cacheKey, {
      response: result.data,
      fetchedAtMillis: Date.now(),
    });
  }
  return result;
}

export function getNearby(
  sigunCode: string,
  options?: RequestOptions,
): Promise<ApiResult<NearbyResponse>> {
  return requestJson<NearbyResponse>(
    `/api/v1/regions/nearby?sigunCode=${encodeURIComponent(sigunCode)}`,
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

export function searchReservoirs(
  q: string,
  options?: RequestOptions,
): Promise<ApiResult<ReservoirSearchResponse>> {
  return requestJson<ReservoirSearchResponse>(
    `/api/v1/reservoirs/search?q=${encodeURIComponent(q)}`,
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
