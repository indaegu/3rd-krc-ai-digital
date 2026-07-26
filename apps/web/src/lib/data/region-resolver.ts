// 시군구 판정 + 우리 지역 대표 저수지 결정 — 서버 전용.
// 판정 순서: admCd 앞 5자리 → 실패 시 legalCode(bdMgtSn 앞 10자리) 앞 5자리.
// 저수지 후보: Supabase reservoirs → 실패 시 커밋 스냅샷(stale=true).
// 논가뭄지도에 없는 코드(광역시 구 단위 42종 포함)는 prepared=false — "이 지역은 준비 중이에요".
// 스냅샷은 JSON import로 Next 번들에 포함한다(런타임 파일 접근 불필요 — Vercel 트레이싱 무관).
import type { RegionResolveResponse } from "@mulsigye/contracts";
import { z } from "zod";
import type { ReservoirSpec } from "./normalize-reservoir-spec.ts";
import {
  pickRepresentativeReservoir,
  type AddressLocality,
} from "./representative-reservoir.ts";
import { createServiceRoleClient } from "./supabase-server.ts";
import sigunIndexJson from "../../../../../data/snapshots/sigun-index.json" with { type: "json" };
import reservoirsJson from "../../../../../data/snapshots/reservoirs.json" with { type: "json" };

export const RESERVOIR_SPEC_SOURCE = "농업기반시설 시설제원_저수지";
export const COMMITTED_SNAPSHOT_SOURCE = "커밋 스냅샷";

export type SigunIndex = Record<
  string,
  { sidoName: string; sigunName: string }
>;

/** 실제 Supabase 클라이언트와 테스트 mock이 공유하는 최소 조회 표면. */
export type ReservoirsClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{
        data: Record<string, unknown>[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

export type RegionResolverDeps = {
  /** 조회 시점에 생성 — 생성 실패도 조회 실패로 취급해 스냅샷으로 폴백한다. */
  createClient?: () => ReservoirsClient;
  sigunIndex?: SigunIndex;
  snapshotReservoirs?: readonly ReservoirSpec[];
};

export type RegionResolution = Pick<
  RegionResolveResponse,
  "sigunCode" | "sigunName" | "prepared" | "reservoir" | "stale" | "sources"
>;

const SIGUN_INDEX: SigunIndex = sigunIndexJson;
const SNAPSHOT_RESERVOIRS: readonly ReservoirSpec[] = reservoirsJson;

const reservoirRowSchema = z.object({
  fac_code: z.string().regex(/^[0-9]{10}$/),
  name: z.string().min(1),
  // 소재지도 받는다 — 읍·면·동/리로 대표지를 좁히려면 필요하다(없으면 시군 단위로만 좁혀진다).
  address: z.string().nullish(),
  beneficiary_area: z.coerce.number().nullable(),
});

function defaultCreateClient(): ReservoirsClient {
  // supabase-js의 제네릭 빌더 타입을 ReservoirsClient와 구조 비교하면 tsc가
  // TS2589(과도한 타입 인스턴스화)로 터진다. 조회 표면은 from().select().eq()로
  // 동일하므로 unknown 경유로 좁힌다(형태는 route 테스트 mock과 계약이 강제).
  return createServiceRoleClient() as unknown as ReservoirsClient;
}

async function fetchReservoirsFromSupabase(
  sigunCode: string,
  createClient: () => ReservoirsClient,
): Promise<ReservoirSpec[]> {
  const client = createClient();
  const { data, error } = await client
    .from("reservoirs")
    .select("fac_code,name,address,beneficiary_area")
    .eq("sigun_code", sigunCode);
  if (error !== null || data === null) {
    throw new Error("reservoirs 조회 실패");
  }
  return data.map((row) => {
    const parsed = reservoirRowSchema.parse(row);
    return {
      facCode: parsed.fac_code,
      name: parsed.name,
      address: parsed.address ?? null,
      sigunCode: parsed.fac_code.slice(0, 5),
      beneficiaryArea: parsed.beneficiary_area,
      effectiveStorage: null,
    };
  });
}

/**
 * admCd·legalCode(각 10자리 검증 완료)를 시군구와 대표 저수지로 확정한다.
 * 같은 입력이면 항상 같은 결과 — 대표지 결정은 pickRepresentativeReservoir 규칙만 따른다.
 *
 * `emdNm`/`liNm`(도로명주소가 준 읍·면·동·리)을 함께 주면 시군 안에서 그 단위까지 좁힌다.
 * 넓은 시군에서 늘 같은 저수지가 뽑히던 문제를 막는다(제주시 → 상대 고정). 좌표·거리는 쓰지
 * 않으며, 이 값들은 대표지 결정에만 쓰고 저장·로그에 남기지 않는다.
 *
 * `facCode`를 주면(사용자가 저수지 이름으로 직접 고른 경우) 그 시설을 그대로 대표지로 쓴다 —
 * 같은 시군에 속하고 후보 목록에 있을 때만이다.
 */
export async function resolveRegion(
  request: {
    admCd: string;
    legalCode: string;
    emdNm?: string | null;
    liNm?: string | null;
    facCode?: string | null;
  },
  deps: RegionResolverDeps = {},
): Promise<RegionResolution> {
  const sigunIndex = deps.sigunIndex ?? SIGUN_INDEX;
  const admPrefix = request.admCd.slice(0, 5);
  const legalPrefix = request.legalCode.slice(0, 5);
  const prefixes =
    admPrefix === legalPrefix ? [admPrefix] : [admPrefix, legalPrefix];

  let matchedCode: string | null = null;
  for (const prefix of prefixes) {
    if (Object.hasOwn(sigunIndex, prefix)) {
      matchedCode = prefix;
      break;
    }
  }

  if (matchedCode === null) {
    // 논가뭄지도에 없는 지역(광역시 구 단위 포함) — 인접 지역 자동 선택 금지, 준비 중 처리.
    return {
      sigunCode: legalPrefix,
      sigunName: null,
      prepared: false,
      reservoir: null,
      stale: false,
      sources: [RESERVOIR_SPEC_SOURCE],
    };
  }

  let candidates: readonly ReservoirSpec[];
  let stale = false;
  try {
    candidates = await fetchReservoirsFromSupabase(
      matchedCode,
      deps.createClient ?? defaultCreateClient,
    );
  } catch {
    candidates = deps.snapshotReservoirs ?? SNAPSHOT_RESERVOIRS;
    stale = true;
  }

  const locality: AddressLocality = {
    emdNm: request.emdNm ?? null,
    liNm: request.liNm ?? null,
  };
  // 사용자가 직접 고른 저수지가 있으면 그것이 대표지다(같은 시군 후보일 때만).
  const chosen =
    request.facCode === undefined || request.facCode === null
      ? null
      : (candidates.find(
          (candidate) =>
            candidate.facCode === request.facCode &&
            candidate.sigunCode === matchedCode,
        ) ?? null);
  const representative =
    chosen ?? pickRepresentativeReservoir(matchedCode, candidates, locality);
  return {
    sigunCode: matchedCode,
    sigunName: sigunIndex[matchedCode]?.sigunName ?? null,
    prepared: representative !== null,
    reservoir:
      representative === null
        ? null
        : { facCode: representative.facCode, name: representative.name },
    stale,
    sources: stale
      ? [RESERVOIR_SPEC_SOURCE, COMMITTED_SNAPSHOT_SOURCE]
      : [RESERVOIR_SPEC_SOURCE],
  };
}
