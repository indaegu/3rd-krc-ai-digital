// POST /api/v1/regions/resolve — 선택한 주소를 시군구·우리 지역 대표 저수지로 확정.
// 요청에는 코드 2개(admCd·legalCode)만 받는다 — 주소 원문은 서버로 다시 오지 않는다.
// 후보가 없거나 준비되지 않은 지역도 HTTP 200 + prepared=false로 응답한다
// (클라이언트 카피: "이 지역은 준비 중이에요").
import type {
  ApiError,
  RegionResolveRequest,
  RegionResolveResponse,
} from "@mulsigye/contracts";
import { z } from "zod";
import {
  resolveRegion,
  type RegionResolverDeps,
} from "../../../../../lib/data/region-resolver.ts";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const CODE_PATTERN = /^[0-9]{10}$/;

const bodySchema = z.strictObject({
  admCd: z.string().regex(CODE_PATTERN),
  legalCode: z.string().regex(CODE_PATTERN),
});

function errorResponse(status: number, error: ApiError): Response {
  return Response.json(error, { status, headers: NO_STORE_HEADERS });
}

function invalidBodyResponse(): Response {
  return errorResponse(400, {
    code: "INVALID_REGION_CODES",
    message: "선택한 주소 정보가 올바르지 않아요. 주소를 다시 선택해 주세요.",
    retryable: false,
  });
}

export function createResolveHandler(deps: RegionResolverDeps = {}) {
  return async function handleResolve(request: Request): Promise<Response> {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return invalidBodyResponse();
    }
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidBodyResponse();
    }
    const resolveRequest: RegionResolveRequest = parsed.data;

    try {
      const resolution = await resolveRegion(resolveRequest, deps);
      const body: RegionResolveResponse = {
        schemaVersion: "1",
        ...resolution,
        asOf: new Date().toISOString(),
      };
      return Response.json(body, { status: 200, headers: NO_STORE_HEADERS });
    } catch {
      // 커밋 스냅샷 폴백까지 실패한 예외 상황 — 주소·코드를 로그에 남기지 않는다.
      return errorResponse(503, {
        code: "REGION_RESOLVE_UNAVAILABLE",
        message:
          "지역 정보를 지금 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        retryable: true,
      });
    }
  };
}

export const POST = createResolveHandler();
