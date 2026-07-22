// 브라우저 전용 모듈 — localStorage에 접근하므로 서버 컴포넌트·Route Handler에서
// import 금지. 저장 값은 지역 코드·대표 시설 코드·동의 버전뿐이다(docs/architecture.md).
// 주소 원문·검색어·지역 이름은 어떤 키에도 저장하지 않는다.

export const REGION_STORE_KEY = "mulsigye:v1";

const SCHEMA_VERSION = 1;

export interface StoredRegion {
  /** KRC 시군 코드 5자리 */
  sigunCode: string;
  /** 대표 저수지 KRC 시설코드 10자리 */
  facCode: string;
}

export interface RegionStore {
  schemaVersion: typeof SCHEMA_VERSION;
  consentVersion: string | null;
  regions: StoredRegion[];
  currentIndex: number;
}

export function createEmptyRegionStore(): RegionStore {
  return {
    schemaVersion: SCHEMA_VERSION,
    consentVersion: null,
    regions: [],
    currentIndex: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 코드 2개만 남긴다. 주소 원문 등 다른 필드가 섞여 들어와도 저장하지 않는다. */
function sanitizeRegion(value: unknown): StoredRegion | null {
  if (!isRecord(value)) {
    return null;
  }
  const { sigunCode, facCode } = value;
  if (typeof sigunCode !== "string" || typeof facCode !== "string") {
    return null;
  }
  return { sigunCode, facCode };
}

function clampIndex(index: number, length: number): number {
  if (length === 0) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

/**
 * 버전 마이그레이션 훅. 새 schemaVersion을 도입하면 case를 추가해
 * 이전 버전 → 현재 버전 변환을 여기서 처리한다.
 * 알 수 없는 버전·손상된 형태는 null을 돌려 안전 초기화로 이어진다.
 */
export function migrateRegionStore(raw: unknown): RegionStore | null {
  if (!isRecord(raw)) {
    return null;
  }
  switch (raw.schemaVersion) {
    case SCHEMA_VERSION:
      return normalizeV1(raw);
    default:
      return null;
  }
}

function normalizeV1(raw: Record<string, unknown>): RegionStore | null {
  if (!Array.isArray(raw.regions)) {
    return null;
  }
  const regions: StoredRegion[] = [];
  for (const item of raw.regions) {
    const region = sanitizeRegion(item);
    if (region === null) {
      return null;
    }
    regions.push(region);
  }
  const currentIndex =
    typeof raw.currentIndex === "number" && Number.isFinite(raw.currentIndex)
      ? raw.currentIndex
      : 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    consentVersion:
      typeof raw.consentVersion === "string" ? raw.consentVersion : null,
    regions,
    currentIndex: clampIndex(currentIndex, regions.length),
  };
}

export function loadRegionStore(): RegionStore {
  try {
    const raw = window.localStorage.getItem(REGION_STORE_KEY);
    if (raw === null) {
      return createEmptyRegionStore();
    }
    return migrateRegionStore(JSON.parse(raw)) ?? createEmptyRegionStore();
  } catch {
    // 손상 JSON·저장소 접근 불가 → 안전 초기화
    return createEmptyRegionStore();
  }
}

export function saveRegionStore(store: RegionStore): void {
  window.localStorage.setItem(REGION_STORE_KEY, JSON.stringify(store));
}

/** 지역 추가. 이미 등록된 시군이면 중복 없이 그 지역을 선택한다. */
export function addRegion(region: StoredRegion): RegionStore {
  const store = loadRegionStore();
  const next = sanitizeRegion(region);
  if (next === null) {
    return store;
  }
  const existing = store.regions.findIndex(
    (item) => item.sigunCode === next.sigunCode,
  );
  if (existing >= 0) {
    store.regions[existing] = next;
    store.currentIndex = existing;
  } else {
    store.regions.push(next);
    store.currentIndex = store.regions.length - 1;
  }
  saveRegionStore(store);
  return store;
}

/** 지역 삭제. 현재 선택이 삭제되거나 앞당겨지면 currentIndex를 보정한다. */
export function removeRegion(sigunCode: string): RegionStore {
  const store = loadRegionStore();
  const removed = store.regions.findIndex(
    (item) => item.sigunCode === sigunCode,
  );
  if (removed < 0) {
    return store;
  }
  store.regions.splice(removed, 1);
  if (removed < store.currentIndex) {
    store.currentIndex -= 1;
  }
  store.currentIndex = clampIndex(store.currentIndex, store.regions.length);
  saveRegionStore(store);
  return store;
}

export function selectRegion(index: number): RegionStore {
  const store = loadRegionStore();
  store.currentIndex = clampIndex(index, store.regions.length);
  saveRegionStore(store);
  return store;
}

export function setConsent(version: string): RegionStore {
  const store = loadRegionStore();
  store.consentVersion = version;
  saveRegionStore(store);
  return store;
}

export function currentRegion(store: RegionStore): StoredRegion | null {
  return store.regions[store.currentIndex] ?? null;
}
