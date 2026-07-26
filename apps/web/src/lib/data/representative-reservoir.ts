// 우리 지역 대표 저수지 결정(순수 함수). GPS 거리·좌표·인접 시군 폴백을 쓰지 않는다.
//
// 시군 하나만 보고 고르면 넓은 시군에서 엉뚱한 저수지가 나온다 — 실측: 제주시(50110)는
// 한림읍·조천읍·구좌읍에 걸쳐 저수지가 5곳인데 수혜면적 최대(상대 670ha)가 늘 뽑혀,
// 조천읍 주소를 골라도 한림읍 상대 저수지가 대표지가 됐다.
//
// 시설제원 CSV에는 좌표가 없어(수혜면적·유효저수량뿐) 실제 거리는 계산할 수 없다. 대신
// 도로명주소가 주는 **읍·면·동(emdNm)과 리(liNm)** 로 후보를 좁힌다. 거리를 지어내지 않고
// 행정구역 단위만 좁히므로 결정적이며, 같은 입력이면 항상 같은 결과다.
//
// 좁히는 순서: ① 같은 리 → ② 같은 읍·면·동 → ③ 같은 시군(종전 규칙).
// 각 단계 안에서는 수혜면적 최대 → 동률이면 facCode 오름차순이다.
import type { ReservoirSpec } from "./normalize-reservoir-spec.ts";

/** 도로명주소가 준 행정구역 이름. 없으면(도심 주소·구 페이로드) 해당 단계를 건너뛴다. */
export type AddressLocality = {
  /** 읍·면·동 이름. 예 "조천읍". */
  emdNm?: string | null;
  /** 리 이름. 예 "함덕리". */
  liNm?: string | null;
};

/**
 * 시설제원 소재지에 이 행정구역 이름이 **토큰으로** 들어 있는지.
 * 부분 문자열이 아니라 공백으로 끊은 토큰과 정확히 비교한다("동명동"이 "동명리"에 걸리지 않게).
 */
export function addressHasLocality(
  address: string | null,
  token: string | null | undefined,
): boolean {
  if (address === null || token === undefined || token === null) return false;
  const needle = token.trim();
  if (needle === "") return false;
  return address.trim().split(/\s+/).includes(needle);
}

export function pickRepresentativeReservoir(
  sigunCode: string,
  reservoirs: readonly ReservoirSpec[],
  locality: AddressLocality = {},
): ReservoirSpec | null {
  const inSigun = reservoirs.filter(
    (candidate) => candidate.sigunCode === sigunCode,
  );
  if (inSigun.length === 0) return null;

  // 좁은 단위부터 본다. 후보가 있는 첫 단계에서 멈춘다.
  const tiers: readonly ReservoirSpec[][] = [
    inSigun.filter(
      (candidate) =>
        addressHasLocality(candidate.address, locality.emdNm) &&
        addressHasLocality(candidate.address, locality.liNm),
    ),
    inSigun.filter((candidate) =>
      addressHasLocality(candidate.address, locality.emdNm),
    ),
    inSigun,
  ];

  for (const tier of tiers) {
    if (tier.length === 0) continue;
    let picked: ReservoirSpec | null = null;
    for (const candidate of tier) {
      if (picked === null || beats(candidate, picked)) {
        picked = candidate;
      }
    }
    return picked;
  }
  return null;
}

/** candidate가 current보다 대표지로 우선하면 true. null 수혜면적은 항상 뒤로 밀린다. */
function beats(candidate: ReservoirSpec, current: ReservoirSpec): boolean {
  const a = candidate.beneficiaryArea;
  const b = current.beneficiaryArea;
  if (a !== null && b === null) return true;
  if (a === null && b !== null) return false;
  if (a !== null && b !== null && a !== b) return a > b;
  return candidate.facCode < current.facCode;
}
