// /api/v1/status 폴백 오케스트레이션 — 서버 전용.
// 대표 저수지 관측: ① 수위 API(60분 fetch 캐시) → ② Supabase reservoir_observations 최신
// → ③ 커밋 스냅샷. 지역 공식 단계: regional_drought_daily 최신 → 실패 시 커밋 스냅샷.
// 사실만 반환한다(관측값·공식 단계) — 예측·확정 표현 없음(AGENTS.md 규칙 3).
// rate(원저수율 %)와 avgRatio(평년 대비 %)는 의미가 다르다 — 절대 섞지 않는다.
import type { StatusResponse } from "@mulsigye/contracts";
import { z } from "zod";
import {
  STAGE_LABEL_BY_CODE,
  stageCodeFromAvgRatio,
  stageCodeFromLabel,
  type DroughtStageCode,
} from "./drought-stage.ts";
import { resolveRegion, type RegionResolverDeps } from "./region-resolver.ts";
import { createServiceRoleClient } from "./supabase-server.ts";
import {
  fetchLatestWaterLevel,
  type WaterLevelApiDeps,
} from "./waterlevel-api.ts";
import observationsSnapshotJson from "../../../../../data/snapshots/reservoir-observations.json" with { type: "json" };
import regionalSnapshotJson from "../../../../../data/snapshots/regional-drought-daily.json" with { type: "json" };

export const WATERLEVEL_API_SOURCE = "농촌용수 저수지 수위정보 조회";
export const SUPABASE_SNAPSHOT_SOURCE = "Supabase 스냅샷";
export const DROUGHT_MAP_SOURCE = "논가뭄지도";

/** 커밋 스냅샷 폴백 사용 시 sources에 스냅샷 기준일을 명시한다(플랜 지시). */
export function committedSnapshotSource(observedOn: string): string {
  return `커밋 스냅샷(기준 ${observedOn})`;
}

/** 실제 Supabase 클라이언트와 테스트 mock이 공유하는 최소 표면(조회 + upsert). */
export type StatusSupabaseClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(
          column: string,
          options: { ascending: boolean },
        ): {
          limit(count: number): PromiseLike<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    upsert(
      rows: Record<string, unknown>[],
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

export type ObservationsSnapshot = {
  latestByFacility: readonly {
    facCode: string;
    observedOn: string;
    rate: number | null;
    source: string;
  }[];
  representativeRecent30d: Record<
    string,
    {
      facCode: string;
      name: string;
      rows: readonly { observedOn: string; rate: number | null }[];
    }
  >;
};

export type RegionalSnapshotRow = {
  observedOn: string;
  sigunCode: string;
  regionalRate: number | null;
  normalRate: number | null;
  avgRatio: number;
  officialStage: string;
};

export type StatusServiceDeps = {
  waterLevel?: WaterLevelApiDeps;
  /** 조회 시점에 생성 — 생성 실패도 조회 실패로 취급해 스냅샷으로 폴백한다. */
  createClient?: () => StatusSupabaseClient;
  resolver?: RegionResolverDeps;
  snapshotObservations?: ObservationsSnapshot;
  snapshotRegional?: readonly RegionalSnapshotRow[];
  now?: () => Date;
};

export type StatusResult =
  | { kind: "ok"; body: StatusResponse }
  | { kind: "not_prepared" }
  | { kind: "unavailable" };

const OBSERVATIONS_SNAPSHOT: ObservationsSnapshot = observationsSnapshotJson;
const REGIONAL_SNAPSHOT: readonly RegionalSnapshotRow[] = regionalSnapshotJson;

const observationRowSchema = z.object({
  observed_on: z.string().min(1),
  rate: z.coerce.number().nullable(),
  water_level: z.coerce.number().nullable(),
});

const regionalRowSchema = z.object({
  observed_on: z.string().min(1),
  regional_rate: z.coerce.number().nullable(),
  normal_rate: z.coerce.number().nullable(),
  avg_ratio: z.coerce.number(),
  official_stage: z.string().nullish(),
});

type ObservationView = {
  rate: number | null;
  waterLevel: number | null;
  observedOn: string;
};

type RegionalView = {
  observedOn: string;
  regionalRate: number | null;
  normalRate: number | null;
  avgRatio: number;
  officialStage: string | null;
};

function defaultCreateClient(): StatusSupabaseClient {
  // supabase-js 제네릭 빌더를 구조 비교하면 TS2589가 나므로 unknown 경유로 좁힌다
  // (region-resolver.ts와 동일한 사유 — 형태는 테스트 mock과 계약이 강제).
  return createServiceRoleClient() as unknown as StatusSupabaseClient;
}

async function latestObservationFromSupabase(
  client: StatusSupabaseClient | null,
  facCode: string,
): Promise<ObservationView | null> {
  if (client === null) return null;
  try {
    const { data, error } = await client
      .from("reservoir_observations")
      .select("observed_on,rate,water_level")
      .eq("fac_code", facCode)
      .order("observed_on", { ascending: false })
      .limit(1);
    if (error !== null || data === null || data.length === 0) return null;
    const parsed = observationRowSchema.safeParse(data[0]);
    if (!parsed.success) return null;
    return {
      rate: parsed.data.rate,
      waterLevel: parsed.data.water_level,
      observedOn: parsed.data.observed_on,
    };
  } catch {
    return null;
  }
}

function latestObservationFromSnapshot(
  snapshot: ObservationsSnapshot,
  sigunCode: string,
  facCode: string,
): ObservationView | null {
  const representative = Object.hasOwn(
    snapshot.representativeRecent30d,
    sigunCode,
  )
    ? snapshot.representativeRecent30d[sigunCode]
    : undefined;
  if (representative !== undefined && representative.facCode === facCode) {
    let latest: { observedOn: string; rate: number | null } | null = null;
    for (const row of representative.rows) {
      if (latest === null || row.observedOn > latest.observedOn) {
        latest = row;
      }
    }
    if (latest !== null) {
      return {
        rate: latest.rate,
        waterLevel: null,
        observedOn: latest.observedOn,
      };
    }
  }
  const byFacility = snapshot.latestByFacility.find(
    (row) => row.facCode === facCode,
  );
  if (byFacility === undefined) return null;
  return {
    rate: byFacility.rate,
    waterLevel: null,
    observedOn: byFacility.observedOn,
  };
}

async function latestRegionalFromSupabase(
  client: StatusSupabaseClient | null,
  sigunCode: string,
): Promise<RegionalView | null> {
  if (client === null) return null;
  try {
    const { data, error } = await client
      .from("regional_drought_daily")
      .select("observed_on,regional_rate,normal_rate,avg_ratio,official_stage")
      .eq("sigun_code", sigunCode)
      .order("observed_on", { ascending: false })
      .limit(1);
    if (error !== null || data === null || data.length === 0) return null;
    const parsed = regionalRowSchema.safeParse(data[0]);
    if (!parsed.success) return null;
    return {
      observedOn: parsed.data.observed_on,
      regionalRate: parsed.data.regional_rate,
      normalRate: parsed.data.normal_rate,
      avgRatio: parsed.data.avg_ratio,
      officialStage: parsed.data.official_stage ?? null,
    };
  } catch {
    return null;
  }
}

function latestRegionalFromSnapshot(
  snapshot: readonly RegionalSnapshotRow[],
  sigunCode: string,
): RegionalView | null {
  let latest: RegionalSnapshotRow | null = null;
  for (const row of snapshot) {
    if (row.sigunCode !== sigunCode) continue;
    if (latest === null || row.observedOn > latest.observedOn) {
      latest = row;
    }
  }
  if (latest === null) return null;
  return {
    observedOn: latest.observedOn,
    regionalRate: latest.regionalRate,
    normalRate: latest.normalRate,
    avgRatio: latest.avgRatio,
    officialStage: latest.officialStage,
  };
}

/** 원천 라벨이 유효하면 원천 우선, 없으면 공인 임계값(70/60/50/40)으로 계산한다. */
function toOfficialStage(region: RegionalView): {
  code: DroughtStageCode;
  label: (typeof STAGE_LABEL_BY_CODE)[DroughtStageCode];
} {
  const fromLabel =
    region.officialStage === null
      ? null
      : stageCodeFromLabel(region.officialStage);
  const code = fromLabel ?? stageCodeFromAvgRatio(region.avgRatio);
  return { code, label: STAGE_LABEL_BY_CODE[code] };
}

/** 정상 응답만 Supabase에 저장한다 — 실패는 응답에 영향을 주지 않는다(fire-and-forget). */
async function upsertObservations(
  client: StatusSupabaseClient | null,
  observations: readonly {
    facCode: string;
    observedOn: string;
    rate: number | null;
    waterLevel: number | null;
  }[],
): Promise<void> {
  if (client === null || observations.length === 0) return;
  try {
    await client.from("reservoir_observations").upsert(
      observations.map((observation) => ({
        fac_code: observation.facCode,
        observed_on: observation.observedOn,
        rate: observation.rate,
        water_level: observation.waterLevel,
        source: "waterlevel_api",
      })),
      { onConflict: "fac_code,observed_on" },
    );
  } catch {
    // upsert 실패해도 status 응답은 그대로 간다.
  }
}

/**
 * sigunCode 하나로 대표 저수지를 재결정(Task 5 resolver 재사용)하고
 * 3단 폴백으로 StatusResponse를 조립한다. HTTP 매핑은 라우트가 맡는다.
 */
export async function buildStatus(
  sigunCode: string,
  deps: StatusServiceDeps = {},
): Promise<StatusResult> {
  // resolver는 admCd/legalCode 앞 5자리만 사용한다 — sigunCode 하나로 재결정.
  const resolution = await resolveRegion(
    { admCd: sigunCode, legalCode: sigunCode },
    deps.resolver ?? {},
  );
  if (
    !resolution.prepared ||
    resolution.reservoir === null ||
    resolution.sigunName === null
  ) {
    return { kind: "not_prepared" };
  }
  const { facCode, name } = resolution.reservoir;

  let client: StatusSupabaseClient | null | undefined;
  const getClient = (): StatusSupabaseClient | null => {
    if (client === undefined) {
      try {
        client = (deps.createClient ?? defaultCreateClient)();
      } catch {
        client = null;
      }
    }
    return client;
  };

  let stale = resolution.stale;
  const sources: string[] = [];

  // ① 수위 API(60분 캐시) → ② Supabase 최신 관측 → ③ 커밋 스냅샷.
  let observation: ObservationView | null = null;
  const api = await fetchLatestWaterLevel(facCode, deps.waterLevel ?? {});
  if (api.ok) {
    observation = {
      rate: api.latest.rate,
      waterLevel: api.latest.waterLevel,
      observedOn: api.latest.observedOn,
    };
    sources.push(WATERLEVEL_API_SOURCE);
    await upsertObservations(getClient(), api.observations);
  } else {
    const fromSupabase = await latestObservationFromSupabase(
      getClient(),
      facCode,
    );
    if (fromSupabase !== null) {
      observation = fromSupabase;
      sources.push(SUPABASE_SNAPSHOT_SOURCE);
      stale = true;
    } else {
      const fromSnapshot = latestObservationFromSnapshot(
        deps.snapshotObservations ?? OBSERVATIONS_SNAPSHOT,
        resolution.sigunCode ?? sigunCode,
        facCode,
      );
      if (fromSnapshot !== null) {
        observation = fromSnapshot;
        sources.push(committedSnapshotSource(fromSnapshot.observedOn));
        stale = true;
      }
    }
  }
  if (observation === null) {
    return { kind: "unavailable" };
  }

  // 지역 공식 단계: regional_drought_daily 최신 행 → 실패 시 커밋 스냅샷.
  let region = await latestRegionalFromSupabase(
    getClient(),
    resolution.sigunCode ?? sigunCode,
  );
  sources.push(DROUGHT_MAP_SOURCE);
  if (region === null) {
    region = latestRegionalFromSnapshot(
      deps.snapshotRegional ?? REGIONAL_SNAPSHOT,
      resolution.sigunCode ?? sigunCode,
    );
    if (region === null) {
      return { kind: "unavailable" };
    }
    const snapshotSource = committedSnapshotSource(region.observedOn);
    if (!sources.includes(snapshotSource)) {
      sources.push(snapshotSource);
    }
    stale = true;
  }

  const body: StatusResponse = {
    schemaVersion: "1",
    sigunCode: resolution.sigunCode ?? sigunCode,
    sigunName: resolution.sigunName,
    reservoir: {
      facCode,
      name,
      rate: observation.rate,
      waterLevel: observation.waterLevel,
      observedOn: observation.observedOn,
    },
    region: {
      observedOn: region.observedOn,
      regionalRate: region.regionalRate,
      normalRate: region.normalRate,
      avgRatio: region.avgRatio,
      officialStage: toOfficialStage(region),
    },
    asOf: (deps.now ?? (() => new Date()))().toISOString(),
    sources,
    stale,
  };
  return { kind: "ok", body };
}
