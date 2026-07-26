// 지역 평년 대비 "최근 실측 기반" 일별 시계열 — 서버 전용.
//
// 공표 논가뭄지도가 연 1회 갱신이라, 오늘 값도 최근 흐름도 공표 자료에는 없다. 이 모듈은
// 수위 API 시군 조회를 31일 창으로 여러 번 나눠 받아 하루 단위 추정 시계열을 만든다.
//
// **status와 forecast는 반드시 이 한 함수를 통해 같은 시계열을 쓴다.** 한쪽만 추정으로 바꾸면
// 같은 화면에서 오늘 값과 그래프 기준이 어긋난다(코드 리뷰 P1 지적).
// 창 URL이 같아 Next 데이터 캐시(revalidate 3600)를 두 라우트가 공유한다.

import {
  estimateFromObservations,
  isEstimatableRegion,
  reservoirCapacitiesFor,
  type RegionEstimate,
} from "./region-estimate.ts";
import {
  COUNTY_MAX_RANGE_DAYS,
  fetchCountyWaterLevels,
  type WaterLevelApiDeps,
} from "./waterlevel-api.ts";

/** 창 개수. 31일 × 2 = 최근 62일 — 차트 "최소 한 달" 요구와 예측 입력(14일)을 모두 넘긴다. */
export const ESTIMATE_SERIES_WINDOWS = 2;

/** 시계열로 인정하는 최소 일수. 이보다 짧으면 흐름으로 쓰지 않는다(오늘 값 용도만). */
export const ESTIMATE_SERIES_MIN_DAYS = 14;

export type RegionEstimateSeriesDeps = {
  waterLevel?: WaterLevelApiDeps;
  /** 창 개수 override — 테스트에서 호출 수를 줄이는 용도. */
  windows?: number;
};

/**
 * 시군의 일별 추정 평년 대비 시계열(날짜 오름차순). 추정 대상이 아니거나 조회가 전부 실패하면
 * 빈 배열이다 — 호출자는 그때 공표값으로 폴백한다.
 *
 * 창은 최신부터 과거로 이어 받되, 중간 창이 실패하면 **거기서 멈추고 이미 받은 만큼만** 쓴다.
 * 과거 창이 비어도 최신 값은 여전히 옳기 때문이다(전체를 버리면 오늘 값까지 잃는다).
 */
export async function fetchRegionEstimateSeries(
  sigunCode: string,
  sigunName: string,
  deps: RegionEstimateSeriesDeps = {},
): Promise<RegionEstimate[]> {
  if (!isEstimatableRegion(sigunCode)) {
    return [];
  }
  const reservoirs = reservoirCapacitiesFor(sigunCode);
  if (reservoirs.length === 0) {
    return [];
  }

  const windows = deps.windows ?? ESTIMATE_SERIES_WINDOWS;
  const byDate = new Map<string, RegionEstimate>();
  for (let index = 0; index < windows; index += 1) {
    const result = await fetchCountyWaterLevels(
      sigunName,
      deps.waterLevel ?? {},
      {
        days: COUNTY_MAX_RANGE_DAYS,
        endOffsetDays: index * COUNTY_MAX_RANGE_DAYS,
      },
    );
    if (!result.ok) {
      break;
    }
    // 창 안의 날짜별로 각각 추정한다 — 커버리지를 못 채운 날짜는 자연히 빠진다.
    for (const observedOn of new Set(
      result.observations.map((observation) => observation.observedOn),
    )) {
      if (byDate.has(observedOn)) continue;
      const sameDay = result.observations.filter(
        (observation) => observation.observedOn === observedOn,
      );
      const estimate = estimateFromObservations({
        sigunCode,
        reservoirs,
        observations: sameDay,
      });
      if (estimate !== null) {
        byDate.set(observedOn, estimate);
      }
    }
  }

  return [...byDate.values()].sort((a, b) =>
    a.observedOn < b.observedOn ? -1 : 1,
  );
}
