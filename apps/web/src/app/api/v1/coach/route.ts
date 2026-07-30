// GET /api/v1/coach?sigunCode= — 공개 코치 경로.
// buildCoach가 기본은 정적 코치(mode "static"·fallbackReason "disabled")이고,
// LLM_ENABLED === "true" && ANTHROPIC_API_KEY 존재 시에만 live 파이프라인
// (캐시·lock·예산 가드 → Claude 1회)을 탄다. 어떤 실패 경로에서도 정적 코치 200을
// 유지하며, 단계·수치·행동 ID·순서는 서버가 확정한다(AGENTS.md 규칙 3·10).
// 현재 프로덕션 기본값은 LLM_ENABLED=false라 이 경로는 Anthropic을 호출하지 않는다.
import {
  beginRequest,
  errorJson,
  okJson,
  tooManyRequestsJson,
  type RequestContext,
} from "../../../../lib/api/respond.ts";
import {
  clientKey,
  createRateLimiter,
  type RateLimiter,
} from "../../../../lib/api/rate-limit.ts";
import {
  buildCoach,
  type CoachServiceDeps,
} from "../../../../lib/coach/coach-service.ts";

export const dynamic = "force-dynamic";

/**
 * 서버리스 실행 상한(초). 상류 조회 2~4초 + LLM 20초를 합쳐도 남도록 잡는다.
 *
 * 이 값을 두지 않으면 플랫폼 기본값(10초)에서 잘려, 정상 생성 중이던 요청이 끊기고
 * 사용자는 이유 없이 정적 코치를 받는다. 정적 폴백 경로는 상류 조회만 하므로 이
 * 상한과 무관하게 빠르게 끝난다.
 */
export const maxDuration = 30;

const SIGUN_CODE_PATTERN = /^[0-9]{5}$/;
const FAC_CODE_PATTERN = /^[0-9]{10}$/;

/**
 * 한 사람이 1분에 부를 수 있는 횟수. 클라이언트가 이미 캐시하므로 정상 사용은 지역당
 * 몇 번뿐이다. LLM 예산을 태우는 경로라 일 단위 가드(예산·live miss 상한)와 별개로
 * 분 단위 폭주를 여기서 먼저 끊는다.
 */
const COACH_LIMIT_PER_MINUTE = 20;

const defaultLimiter = createRateLimiter({
  limit: COACH_LIMIT_PER_MINUTE,
  windowMs: 60_000,
});

/** 서비스 의존성에 속도 제한 주입점을 더한다(테스트에서 갈아 끼운다). */
type CoachHandlerDeps = CoachServiceDeps & { rateLimiter?: RateLimiter };

function unavailableResponse(context: RequestContext): Response {
  return errorJson(context, 503, {
    code: "COACH_UNAVAILABLE",
    message: "코치 안내를 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    retryable: true,
  });
}

export function createCoachHandler(deps: CoachHandlerDeps = {}) {
  return async function handleCoach(request: Request): Promise<Response> {
    const context = beginRequest("/api/v1/coach");

    const verdict = (deps.rateLimiter ?? defaultLimiter).check(
      clientKey(request),
    );
    if (!verdict.allowed) {
      return tooManyRequestsJson(context, verdict.retryAfterSeconds);
    }

    const params = new URL(request.url).searchParams;
    const sigunCode = params.get("sigunCode") ?? "";
    // 선택 저수지. 형식이 어긋나면 오류로 막지 않고 무시한다(코치 조회 자체는 계속돼야 한다).
    const rawFacCode = params.get("facCode");
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
      const result = await buildCoach(sigunCode, deps, facCode);
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
      // mode·fallbackReason은 이미 비식별 열거값이다. 이게 없으면 배포본에서
      // 코치가 왜 정적으로 떨어졌는지 알 방법이 없다.
      return okJson(context, result.body, {
        fallback: result.body.fallbackReason ?? result.body.mode,
      });
    } catch {
      // 예상 밖 예외 — 조회 값이 섞일 수 있어 로그를 찍지 않는다(forecast route와 동일).
      return unavailableResponse(context);
    }
  };
}

export const GET = createCoachHandler();
