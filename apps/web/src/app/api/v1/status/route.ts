// GET /api/v1/status?sigunCode= — 대표 저수지 현재값과 공식 가뭄단계(사실만 반환).
// 60분 캐시는 수위 API fetch 레벨(next.revalidate=3600)에서 관리하므로 라우트는 dynamic이다.
// 수위 API 장애에도 Supabase·커밋 스냅샷 폴백으로 HTTP 200 stale=true를 유지한다.
import type { ApiError } from "@mulsigye/contracts";
import {
  buildStatus,
  type StatusServiceDeps,
} from "../../../../lib/data/status-service.ts";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const SIGUN_CODE_PATTERN = /^[0-9]{5}$/;

function errorResponse(status: number, error: ApiError): Response {
  return Response.json(error, { status, headers: NO_STORE_HEADERS });
}

function unavailableResponse(): Response {
  return errorResponse(503, {
    code: "STATUS_UNAVAILABLE",
    message:
      "저수지 상태를 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    retryable: true,
  });
}

export function createStatusHandler(deps: StatusServiceDeps = {}) {
  return async function handleStatus(request: Request): Promise<Response> {
    const sigunCode = new URL(request.url).searchParams.get("sigunCode") ?? "";
    if (!SIGUN_CODE_PATTERN.test(sigunCode)) {
      return errorResponse(400, {
        code: "INVALID_SIGUN_CODE",
        message: "지역 코드가 올바르지 않아요. 지역을 다시 선택해 주세요.",
        retryable: false,
      });
    }

    try {
      const result = await buildStatus(sigunCode, deps);
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
      // 예상 밖 예외 — serviceKey·조회 값이 섞일 수 있어 로그를 찍지 않는다.
      return unavailableResponse();
    }
  };
}

export const GET = createStatusHandler();
