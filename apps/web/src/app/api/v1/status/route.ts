// GET /api/v1/status?sigunCode=&facCode= — 대표 저수지 현재값과 공식 가뭄단계(사실만 반환).
// facCode는 사용자가 저수지 이름으로 직접 고른 경우에만 붙는다(같은 시군일 때만 쓰인다).
// 60분 캐시는 수위 API fetch 레벨(next.revalidate=3600)에서 관리하므로 라우트는 dynamic이다.
// 수위 API 장애에도 Supabase·커밋 스냅샷 폴백으로 HTTP 200 stale=true를 유지한다.
import {
  beginRequest,
  errorJson,
  okJson,
  type RequestContext,
} from "../../../../lib/api/respond.ts";
import {
  buildStatus,
  type StatusServiceDeps,
} from "../../../../lib/data/status-service.ts";

export const dynamic = "force-dynamic";

const SIGUN_CODE_PATTERN = /^[0-9]{5}$/;
const FAC_CODE_PATTERN = /^[0-9]{10}$/;

function unavailableResponse(context: RequestContext): Response {
  return errorJson(context, 503, {
    code: "STATUS_UNAVAILABLE",
    message:
      "저수지 상태를 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    retryable: true,
  });
}

export function createStatusHandler(deps: StatusServiceDeps = {}) {
  return async function handleStatus(request: Request): Promise<Response> {
    const context = beginRequest("/api/v1/status");
    const params = new URL(request.url).searchParams;
    const sigunCode = params.get("sigunCode") ?? "";
    const rawFacCode = params.get("facCode");
    // 형식이 어긋난 facCode는 오류로 막지 않고 무시한다 — 지역 조회 자체는 계속 되어야 한다.
    const facCode =
      rawFacCode !== null && FAC_CODE_PATTERN.test(rawFacCode)
        ? rawFacCode
        : null;
    if (!SIGUN_CODE_PATTERN.test(sigunCode)) {
      return errorJson(context, 400, {
        code: "INVALID_SIGUN_CODE",
        message: "지역 코드가 올바르지 않아요. 지역을 다시 선택해 주세요.",
        retryable: false,
      });
    }

    try {
      const result = await buildStatus(sigunCode, deps, facCode);
      if (result.kind === "not_prepared") {
        return errorJson(context, 404, {
          code: "REGION_NOT_PREPARED",
          message: "이 지역은 아직 준비 중이에요. 다른 지역을 선택해 주세요.",
          retryable: false,
        });
      }
      if (result.kind === "unavailable") {
        return unavailableResponse(context);
      }
      return okJson(context, result.body);
    } catch {
      // 예상 밖 예외 — serviceKey·조회 값이 섞일 수 있어 로그를 찍지 않는다.
      return unavailableResponse(context);
    }
  };
}

export const GET = createStatusHandler();
