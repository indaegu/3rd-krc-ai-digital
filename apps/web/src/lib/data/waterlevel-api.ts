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

/**
 * 대표 저수지 조회 기간(일). 시설코드 조회는 최대 365일이라 여유가 있다.
 * 차트의 "저수지 실측"을 30일로 보여 달라는 요청에 맞춰 14 → 30으로 늘렸다.
 */
const LOOKBACK_DAYS = 30;
const DEFAULT_TIMEOUT_MS = 5_000;
const PAGE_SIZE = 100;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 시군 조회 한 번의 최대 기간(일). 이보다 길면 API가 returnReasonCode 15로 거절한다
 * (실측: 31일 정상, 62일 거절 — docs/data-sources.md).
 */
export const COUNTY_MAX_RANGE_DAYS = 31;
/** 기본 조회 기간. 더 긴 시계열은 호출자가 창을 나눠 여러 번 부른다. */
export const COUNTY_LOOKBACK_DAYS = 7;
/** 최대 시군(나주 161곳)×31일=4,991행이 한 페이지에 들어온다. 페이지는 안전망이다. */
const COUNTY_PAGE_SIZE = 5_000;
const COUNTY_MAX_PAGES = 4;
/** 시군 조회는 응답이 커서 시설코드 조회보다 여유를 둔다. */
const COUNTY_TIMEOUT_MS = 8_000;

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

export type CountyWaterLevelResult =
  { ok: true; observations: WaterLevelObservation[] } | { ok: false };

/** 시군 조회 창. 31일 제한 때문에 긴 시계열은 창을 나눠 여러 번 부른다. */
export type CountyWindow = {
  /** 창의 길이(일). COUNTY_MAX_RANGE_DAYS를 넘기면 잘라낸다. */
  days?: number;
  /** 창의 끝을 오늘에서 며칠 과거로 밀지. 0이면 오늘까지. */
  endOffsetDays?: number;
};

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

/**
 * 시군 이름(`county`)으로 최근 7일 관측을 전부 조회한다 — 지역 평년 대비 추정의 재료다.
 * `county`는 코드가 아니라 시군 **이름**을 받는다(실측: `50110`은 NO_DATA, `제주시`는 정상).
 *
 * 한 시군이 7일이면 최대 1,127행이라 페이지를 이어 받는다. 도중에 한 페이지라도 실패하면
 * 부분 집계로 통합저수율이 편향되므로 전체를 { ok: false }로 버린다 — 폴백은 호출자 몫.
 */
export async function fetchCountyWaterLevels(
  countyName: string,
  deps: WaterLevelApiDeps = {},
  window: CountyWindow = {},
): Promise<CountyWaterLevelResult> {
  const fetchImpl: WaterLevelFetch = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? process.env["DATA_GO_KR_API_KEY"];
  if (apiKey === undefined || apiKey === "" || countyName === "") {
    return { ok: false };
  }

  const days = Math.min(
    window.days ?? COUNTY_LOOKBACK_DAYS,
    COUNTY_MAX_RANGE_DAYS,
  );
  const now = (deps.now ?? (() => new Date()))();
  // endOffsetDays만큼 과거로 창을 밀어 더 긴 시계열을 이어 붙인다(31일 제한 우회).
  const end = new Date(
    now.getTime() - (window.endOffsetDays ?? 0) * 24 * 60 * 60 * 1000,
  );
  const dateE = kstYmd(end);
  const dateS = kstYmd(
    new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000),
  );

  const observations: WaterLevelObservation[] = [];
  try {
    for (let pageNo = 1; pageNo <= COUNTY_MAX_PAGES; pageNo += 1) {
      const query = [
        `serviceKey=${encodeURIComponent(apiKey)}`,
        `county=${encodeURIComponent(countyName)}`,
        `date_s=${dateS}`,
        `date_e=${dateE}`,
        `pageNo=${String(pageNo)}`,
        `numOfRows=${COUNTY_PAGE_SIZE}`,
      ].join("&");

      const response = await fetchImpl(`${WATERLEVEL_ENDPOINT}?${query}`, {
        next: { revalidate: WATERLEVEL_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(deps.timeoutMs ?? COUNTY_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { ok: false };
      }

      const parsed = parseWaterLevelXml(await response.text());
      if (!parsed.ok) {
        // NO_DATA(99)도 여기로 온다 — 추정 불가로 보고 폴백시킨다.
        return { ok: false };
      }

      observations.push(...parsed.page.observations);
      if (
        parsed.page.observations.length === 0 ||
        observations.length >= parsed.page.totalCount
      ) {
        break;
      }
    }
  } catch {
    return { ok: false };
  }

  if (observations.length === 0) {
    return { ok: false };
  }
  return { ok: true, observations };
}
