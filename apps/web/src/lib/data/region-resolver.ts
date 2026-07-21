// 시군구 판정 + 우리 지역 대표 저수지 결정 — 서버 전용.
// 판정 순서: admCd 앞 5자리 → 실패 시 legalCode(bdMgtSn 앞 10자리) 앞 5자리.
// 저수지 후보: Supabase reservoirs → 실패 시 커밋 스냅샷(stale=true).
// 논가뭄지도에 없는 코드(광역시 구 단위 42종 포함)는 prepared=false — "이 지역은 준비 중이에요".
// 스냅샷은 JSON import로 Next 번들에 포함한다(런타임 파일 접근 불필요 — Vercel 트레이싱 무관).
import type { RegionResolveResponse } from "@mulsigye/contracts";
import { z } from "zod";
import type { ReservoirSpec } from "./normalize-reservoir-spec.ts";
import { pickRepresentativeReservoir } from "./representative-reservoir.ts";
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
    .select("fac_code,name,beneficiary_area")
    .eq("sigun_code", sigunCode);
  if (error !== null || data === null) {
    throw new Error("reservoirs 조회 실패");
  }
  return data.map((row) => {
    const parsed = reservoirRowSchema.parse(row);
    return {
      facCode: parsed.fac_code,
      name: parsed.name,
      address: null,
      sigunCode: parsed.fac_code.slice(0, 5),
      beneficiaryArea: parsed.beneficiary_area,
      effectiveStorage: null,
    };
  });
}

/**
 * admCd·legalCode(각 10자리 검증 완료)를 시군구와 대표 저수지로 확정한다.
 * 같은 입력이면 항상 같은 결과 — 대표지 결정은 pickRepresentativeReservoir 규칙만 따른다.
 */
export async function resolveRegion(
  request: { admCd: string; legalCode: string },
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

  const representative = pickRepresentativeReservoir(matchedCode, candidates);
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
