// GET /api/v1/reservoirs/search — 저수지 이름으로 후보 조회.
//
// 주소를 몰라도 아는 저수지 이름으로 지역을 등록하게 하는 길이다. 넓은 시군에서는 주소만으로
// 원하는 저수지가 안 잡힌다(실측: 제주시 5곳 중 수혜면적 최대인 상대가 늘 뽑혔다).
// 커밋 스냅샷만 읽는 순수 조회라 Supabase·외부 API를 부르지 않는다. 좌표·거리도 쓰지 않는다.
import type { ReservoirSearchResponse } from "@mulsigye/contracts";
import { z } from "zod";
import {
  beginRequest,
  errorJson,
  okJson,
} from "../../../../../lib/api/respond.ts";
import {
  searchReservoirsByName,
  type ReservoirSearchDeps,
} from "../../../../../lib/data/reservoir-search.ts";

export const dynamic = "force-dynamic";

export const RESERVOIR_SPEC_SOURCE = "농업기반시설 시설제원_저수지";

const querySchema = z.string().trim().min(2).max(30);

type SearchHandlerDeps = {
  reservoirs?: ReservoirSearchDeps;
  now?: () => Date;
};

export function createReservoirSearchHandler(deps: SearchHandlerDeps = {}) {
  return function handleSearch(request: Request): Response {
    const context = beginRequest("/api/v1/reservoirs/search");
    const raw = new URL(request.url).searchParams.get("q") ?? "";
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      return errorJson(context, 400, {
        code: "INVALID_QUERY",
        message: "저수지 이름을 두 글자 이상 입력해 주세요.",
        retryable: false,
      });
    }

    const body: ReservoirSearchResponse = {
      schemaVersion: "1",
      reservoirs: searchReservoirsByName(parsed.data, deps.reservoirs),
      asOf: (deps.now ?? (() => new Date()))().toISOString(),
      sources: [RESERVOIR_SPEC_SOURCE],
      // 커밋 스냅샷을 읽는 정적 조회다 — 지연된 폴백이 아니므로 stale=false.
      stale: false,
    };
    return okJson(context, body);
  };
}

export const GET = createReservoirSearchHandler();
