// GET /api/v1/forecast?sigunCode= — 14일 예측·밴드·추세·도달 버킷(참고 표현 전용).
// 서버는 숫자·버킷·단계만 반환하고 문장을 만들지 않는다(AGENTS.md 규칙 3).
// Supabase 장애에도 커밋 스냅샷 폴백으로 HTTP 200 stale=true를 유지한다.
import type { ApiError } from "@mulsigye/contracts";
import {
  buildForecast,
  type ForecastServiceDeps,
} from "../../../../lib/prediction/forecast-service.ts";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const SIGUN_CODE_PATTERN = /^[0-9]{5}$/;

function errorResponse(status: number, error: ApiError): Response {
  return Response.json(error, { status, headers: NO_STORE_HEADERS });
}

function unavailableResponse(): Response {
  return errorResponse(503, {
    code: "FORECAST_UNAVAILABLE",
    message: "예측을 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    retryable: true,
  });
}

export function createForecastHandler(deps: ForecastServiceDeps = {}) {
  return async function handleForecast(request: Request): Promise<Response> {
    const sigunCode = new URL(request.url).searchParams.get("sigunCode") ?? "";
    if (!SIGUN_CODE_PATTERN.test(sigunCode)) {
      return errorResponse(400, {
        code: "INVALID_SIGUN_CODE",
        message: "지역 코드가 올바르지 않아요. 지역을 다시 선택해 주세요.",
        retryable: false,
      });
    }

    try {
      const result = await buildForecast(sigunCode, deps);
      if (result.kind === "not_prepared") {
        return errorResponse(404, {
          code: "REGION_NOT_PREPARED",
          message: "이 지역은 아직 준비 중이에요. 다른 지역을 선택해 주세요.",
          retryable: false,
        });
      }
      if (result.kind === "unavailable") {
        return unavailableResponse();
      }
      return Response.json(result.body, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    } catch {
      // 예상 밖 예외 — 조회 값이 섞일 수 있어 로그를 찍지 않는다(status route와 동일).
      return unavailableResponse();
    }
  };
}

export const GET = createForecastHandler();
