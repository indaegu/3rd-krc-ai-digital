// GET /api/v1/coach?sigunCode= — 정적 코치 전용 공개 경로(LLM 미호출).
// 코치 카피는 검토 완료 행동 카탈로그 문구만 사용한다(AGENTS.md 규칙 3·10).
// mode "static"·fallbackReason "disabled" 고정 — live 연결은 캐시·lock·예산
// 가드가 자동 테스트되는 별도 변경에서만 한다(packages/llm AGENTS.md).
import type { ApiError } from "@mulsigye/contracts";
import {
  buildCoach,
  type CoachServiceDeps,
} from "../../../../lib/coach/coach-service.ts";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const SIGUN_CODE_PATTERN = /^[0-9]{5}$/;

function errorResponse(status: number, error: ApiError): Response {
  return Response.json(error, { status, headers: NO_STORE_HEADERS });
}

function unavailableResponse(): Response {
  return errorResponse(503, {
    code: "COACH_UNAVAILABLE",
    message: "코치 안내를 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    retryable: true,
  });
}

export function createCoachHandler(deps: CoachServiceDeps = {}) {
  return async function handleCoach(request: Request): Promise<Response> {
    const sigunCode = new URL(request.url).searchParams.get("sigunCode") ?? "";
    if (!SIGUN_CODE_PATTERN.test(sigunCode)) {
      return errorResponse(400, {
        code: "INVALID_SIGUN_CODE",
        message: "지역 코드가 올바르지 않아요. 지역을 다시 선택해 주세요.",
        retryable: false,
      });
    }

    try {
      const result = await buildCoach(sigunCode, deps);
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
      // 예상 밖 예외 — 조회 값이 섞일 수 있어 로그를 찍지 않는다(forecast route와 동일).
      return unavailableResponse();
    }
  };
}

export const GET = createCoachHandler();
