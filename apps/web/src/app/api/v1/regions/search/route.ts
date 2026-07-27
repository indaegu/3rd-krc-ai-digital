// GET /api/v1/regions/search — 주소 검색으로 지역 후보 목록 조회.
// 사용자별 검색이므로 캐시하지 않는다(no-store). 검색어·주소 원문은 응답으로만
// 흘려보내고 로그·저장소에 남기지 않는다(플랜 Global Constraints).
import type { RegionSearchResponse } from "@mulsigye/contracts";
import { z } from "zod";
import {
  beginRequest,
  errorJson,
  okJson,
} from "../../../../../lib/api/respond.ts";
import {
  searchJusoAddresses,
  type JusoDeps,
  type JusoFailureReason,
} from "../../../../../lib/data/juso.ts";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(2).max(100);

type SearchHandlerDeps = {
  juso?: JusoDeps;
};

/**
 * 도로명주소 실패 사유 → 사용자 안내. 종전에는 모든 실패가 하나의 503 "잠시 어려워요"로
 * 뭉개져, "인천"처럼 시·도만 넣은 경우에도 재시도하라는 엉뚱한 안내가 나갔다.
 *
 * 사용자가 고칠 수 있는 입력 문제는 400·`retryable=false`로 **무엇을 바꿔야 하는지** 알려주고,
 * 서비스 쪽 문제만 503으로 둔다. 문구는 ~해요체·짧은 문장(product.md 카피 규칙).
 * 분류표는 `lib/data/juso.ts`의 JusoFailureReason이 단일 출처다.
 */
const FAILURE_RESPONSE: Record<
  JusoFailureReason,
  { status: number; code: string; message: string; retryable: boolean }
> = {
  too_broad: {
    status: 400,
    code: "JUSO_TOO_BROAD",
    message:
      "시·도 이름만으로는 찾을 수 없어요. ‘인천 남동구’처럼 시·군·구까지 넣어 주세요.",
    retryable: false,
  },
  too_many: {
    status: 400,
    code: "JUSO_TOO_MANY",
    message:
      "결과가 너무 많아요. 읍·면·동이나 도로명까지 넣으면 찾을 수 있어요.",
    retryable: false,
  },
  too_short: {
    status: 400,
    code: "JUSO_TOO_SHORT",
    message: "두 글자 이상 넣어 주세요.",
    retryable: false,
  },
  digits_only: {
    status: 400,
    code: "JUSO_DIGITS_ONLY",
    message:
      "숫자만으로는 찾을 수 없어요. 동네 이름이나 도로명을 함께 넣어 주세요.",
    retryable: false,
  },
  long_number: {
    status: 400,
    code: "JUSO_LONG_NUMBER",
    message: "숫자가 너무 길어요. 10자리 이하로 넣어 주세요.",
    retryable: false,
  },
  too_long: {
    status: 400,
    code: "JUSO_TOO_LONG",
    message: "검색어가 너무 길어요. 조금 짧게 줄여 주세요.",
    retryable: false,
  },
  forbidden_chars: {
    status: 400,
    code: "JUSO_FORBIDDEN_CHARS",
    message: "특수문자는 빼고 넣어 주세요.",
    retryable: false,
  },
  empty: {
    status: 400,
    code: "JUSO_EMPTY",
    message: "검색어를 넣어 주세요.",
    retryable: false,
  },
  auth: {
    // 승인키 문제는 사용자가 다시 눌러도 풀리지 않는다 — retryable=false로 솔직하게 둔다.
    status: 503,
    code: "JUSO_AUTH",
    message: "주소 검색을 지금은 쓸 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
    retryable: false,
  },
  system: {
    status: 503,
    code: "JUSO_UNAVAILABLE",
    message: "주소 검색이 잠시 어려워요. 조금 뒤에 다시 시도해 주세요.",
    retryable: true,
  },
  unknown: {
    status: 503,
    code: "JUSO_UNAVAILABLE",
    message: "주소 검색이 잠시 어려워요. 조금 뒤에 다시 시도해 주세요.",
    retryable: true,
  },
};

export function createSearchHandler(deps: SearchHandlerDeps = {}) {
  return async function handleSearch(request: Request): Promise<Response> {
    const context = beginRequest("/api/v1/regions/search");
    const rawQuery = new URL(request.url).searchParams.get("q") ?? "";
    const parsedQuery = querySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return errorJson(context, 400, {
        code: "INVALID_QUERY",
        message: "검색어를 두 글자 이상 입력해 주세요.",
        retryable: false,
      });
    }

    const result = await searchJusoAddresses(parsedQuery.data, deps.juso);
    if (!result.ok) {
      const mapped = FAILURE_RESPONSE[result.reason];
      return errorJson(context, mapped.status, {
        code: mapped.code,
        message: mapped.message,
        retryable: mapped.retryable,
      });
    }

    const body: RegionSearchResponse = {
      schemaVersion: "1",
      candidates: result.candidates,
      asOf: new Date().toISOString(),
      sources: ["도로명주소 API"],
      stale: false,
    };
    return okJson(context, body);
  };
}

export const GET = createSearchHandler();
