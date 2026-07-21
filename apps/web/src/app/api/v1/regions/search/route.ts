// GET /api/v1/regions/search — 주소 검색으로 지역 후보 목록 조회.
// 사용자별 검색이므로 캐시하지 않는다(no-store). 검색어·주소 원문은 응답으로만
// 흘려보내고 로그·저장소에 남기지 않는다(플랜 Global Constraints).
import type { ApiError, RegionSearchResponse } from "@mulsigye/contracts";
import { z } from "zod";
import {
  searchJusoAddresses,
  type JusoDeps,
} from "../../../../../lib/data/juso.ts";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const querySchema = z.string().trim().min(2).max(100);

type SearchHandlerDeps = {
  juso?: JusoDeps;
};

function errorResponse(status: number, error: ApiError): Response {
  return Response.json(error, { status, headers: NO_STORE_HEADERS });
}

export function createSearchHandler(deps: SearchHandlerDeps = {}) {
  return async function handleSearch(request: Request): Promise<Response> {
    const rawQuery = new URL(request.url).searchParams.get("q") ?? "";
    const parsedQuery = querySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return errorResponse(400, {
        code: "INVALID_QUERY",
        message: "검색어를 두 글자 이상 입력해 주세요.",
        retryable: false,
      });
    }

    const result = await searchJusoAddresses(parsedQuery.data, deps.juso);
    if (!result.ok) {
      return errorResponse(503, {
        code: "JUSO_UNAVAILABLE",
        message: "주소 검색이 잠시 어려워요. 조금 뒤에 다시 시도해 주세요.",
        retryable: true,
      });
    }

    const body: RegionSearchResponse = {
      schemaVersion: "1",
      candidates: result.candidates,
      asOf: new Date().toISOString(),
      sources: ["도로명주소 API"],
      stale: false,
    };
    return Response.json(body, { status: 200, headers: NO_STORE_HEADERS });
  };
}

export const GET = createSearchHandler();
