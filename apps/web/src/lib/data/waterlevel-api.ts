// 농촌용수 저수지 수위정보 API 호출 — 서버 전용.
// DATA_GO_KR_API_KEY는 디코딩 키이므로 encodeURIComponent가 필수다(플랜 Global Constraints).
// 캐시는 fetch 레벨 next.revalidate=3600(60분) 한 곳에서만 관리한다.
// 이 모듈은 로그를 찍지 않는다 — 오류 객체·URL에 serviceKey가 섞일 수 있다.
import {
  parseWaterLevelXml,
  type WaterLevelObservation,
} from "./normalize-waterlevel-xml.ts";

/** 원본 오타(reservior) 그대로가 실제 엔드포인트다 — 고치지 않는다. */
export const WATERLEVEL_ENDPOINT =
  "http://apis.data.go.kr/B552149/reserviorWaterLevel/reservoirlevel/";

/** 60분 캐시 — Next 데이터 캐시 revalidate 초. */
export const WATERLEVEL_REVALIDATE_SECONDS = 3600;

/** 최근 14일 조회(시설코드 조회 최대 365일 제한 내). */
const LOOKBACK_DAYS = 14;
const DEFAULT_TIMEOUT_MS = 5_000;
const PAGE_SIZE = 100;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type WaterLevelFetchInit = RequestInit & {
  next?: { revalidate: number };
};

export type WaterLevelFetch = (
  url: string,
  init?: WaterLevelFetchInit,
) => Promise<Response>;

export type WaterLevelApiDeps = {
  fetchImpl?: WaterLevelFetch;
  apiKey?: string | undefined;
  timeoutMs?: number;
  now?: () => Date;
};

export type WaterLevelFetchResult =
  | {
      ok: true;
      /** check_date 최대(최신) 관측. */
      latest: WaterLevelObservation;
      /** 정상 응답의 전체 관측 — Supabase upsert 재료. */
      observations: WaterLevelObservation[];
    }
  | { ok: false };

/** KST 달력일 `YYYYMMDD` — API date_s/date_e 형식. */
function kstYmd(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
}

/**
 * 시설코드 하나의 최근 14일 관측을 조회해 최신 관측을 고른다.
 * 실패(HTTP·returnReasonCode·timeout·관측 0건)는 전부 { ok: false }로 수렴한다 — 폴백은 호출자 몫.
 */
export async function fetchLatestWaterLevel(
  facCode: string,
  deps: WaterLevelApiDeps = {},
): Promise<WaterLevelFetchResult> {
  const fetchImpl: WaterLevelFetch = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? process.env["DATA_GO_KR_API_KEY"];
  if (apiKey === undefined || apiKey === "") {
    return { ok: false };
  }

  const now = (deps.now ?? (() => new Date()))();
  const dateE = kstYmd(now);
  const dateS = kstYmd(
    new Date(now.getTime() - (LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000),
  );
  const query = [
    // 디코딩 키 — URLSearchParams 대신 명시적 encodeURIComponent(플랜 지시).
    `serviceKey=${encodeURIComponent(apiKey)}`,
    `fac_code=${encodeURIComponent(facCode)}`,
    `date_s=${dateS}`,
    `date_e=${dateE}`,
    "pageNo=1",
    `numOfRows=${PAGE_SIZE}`,
  ].join("&");

  try {
    const response = await fetchImpl(`${WATERLEVEL_ENDPOINT}?${query}`, {
      next: { revalidate: WATERLEVEL_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false };
    }

    const parsed = parseWaterLevelXml(await response.text());
    if (!parsed.ok) {
      return { ok: false };
    }

    const observations = parsed.page.observations.filter(
      (observation) => observation.facCode === facCode,
    );
    let latest: WaterLevelObservation | null = null;
    for (const observation of observations) {
      if (latest === null || observation.observedOn > latest.observedOn) {
        latest = observation;
      }
    }
    if (latest === null) {
      return { ok: false };
    }
    return { ok: true, latest, observations };
  } catch {
    // 네트워크 오류·timeout — serviceKey가 담긴 URL이 오류에 섞일 수 있어 로그를 찍지 않는다.
    return { ok: false };
  }
}
