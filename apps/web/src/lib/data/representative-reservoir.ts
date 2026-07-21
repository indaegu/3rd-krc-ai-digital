// 우리 지역 대표 저수지 결정(순수 함수). GPS 거리·인접 지역 폴백을 쓰지 않는다.
// 규칙: 같은 시군구 후보 중 수혜면적 최대 → 동률이면 facCode 오름차순 → 후보 없으면 null.
import type { ReservoirSpec } from "./normalize-reservoir-spec";

export function pickRepresentativeReservoir(
  sigunCode: string,
  reservoirs: readonly ReservoirSpec[],
): ReservoirSpec | null {
  let picked: ReservoirSpec | null = null;

  for (const candidate of reservoirs) {
    if (candidate.sigunCode !== sigunCode) {
      continue;
    }
    if (picked === null || beats(candidate, picked)) {
      picked = candidate;
    }
  }

  return picked;
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
