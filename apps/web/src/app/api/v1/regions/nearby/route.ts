// GET /api/v1/regions/nearby?sigunCode= — 같은 시·도 지역들의 가뭄단계·평년대비 저수율 비교.
// 커밋 스냅샷 기반이라 stale=true HTTP 200을 유지한다. 기존 엔드포인트는 건드리지 않는 additive 경로다.
import type { ApiError } from "@mulsigye/contracts";
import {
  buildNearby,
  type NearbyServiceDeps,
} from "../../../../../lib/data/nearby-service.ts";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const SIGUN_CODE_PATTERN = /^[0-9]{5}$/;

function errorResponse(status: number, error: ApiError): Response {
  return Response.json(error, { status, headers: NO_STORE_HEADERS });
}

function unavailableResponse(): Response {
  return errorResponse(503, {
    code: "NEARBY_UNAVAILABLE",
    message:
      "주변 지역 비교를 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    retryable: true,
  });
}

export function createNearbyHandler(deps: NearbyServiceDeps = {}) {
  return async function handleNearby(request: Request): Promise<Response> {
    const sigunCode = new URL(request.url).searchParams.get("sigunCode") ?? "";
    if (!SIGUN_CODE_PATTERN.test(sigunCode)) {
      return errorResponse(400, {
        code: "INVALID_SIGUN_CODE",
        message: "지역 코드가 올바르지 않아요. 지역을 다시 선택해 주세요.",
        retryable: false,
      });
    }

    try {
      const result = buildNearby(sigunCode, deps);
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
      // 예상 밖 예외 — 조회 값이 섞일 수 있어 로그를 찍지 않는다.
      return unavailableResponse();
    }
  };
}

export const GET = createNearbyHandler();
