"use client";

// 등록 지역 리스트 — 선택·삭제·빈 상태. 저장소에는 코드만 있으므로
// 지역 이름·대표 저수지명은 /api/v1/status를 병렬 호출해 표시한다.

import { useCallback, useEffect, useRef, useState } from "react";

import { getStatus } from "../lib/client/api-client";
import {
  loadRegionStore,
  removeRegion,
  selectRegion,
  type RegionStore,
} from "../lib/client/region-store";
import styles from "./RegionList.module.css";
import { Skeleton } from "./ui/Skeleton";

type NameState =
  | { kind: "loading" }
  | { kind: "ready"; sigunName: string; reservoirName: string }
  | { kind: "error" };

const LOADING_NAME: NameState = { kind: "loading" };

interface RegionListProps {
  /** 저장소가 바뀔 때마다(마운트 포함) 호출한다. 페이지가 CTA 노출 판단에 쓴다. */
  onStoreChange?: (store: RegionStore) => void;
}

export function RegionList({ onStoreChange }: RegionListProps) {
  const [store, setStore] = useState<RegionStore | null>(null);
  const [names, setNames] = useState<Record<string, NameState>>({});
  const onStoreChangeRef = useRef(onStoreChange);

  useEffect(() => {
    onStoreChangeRef.current = onStoreChange;
  }, [onStoreChange]);

  const loadName = useCallback(async (sigunCode: string) => {
    const result = await getStatus(sigunCode);
    setNames((prev) => ({
      ...prev,
      [sigunCode]:
        result.kind === "ok"
          ? {
              kind: "ready",
              sigunName: result.data.sigunName,
              reservoirName: result.data.reservoir.name,
            }
          : { kind: "error" },
    }));
  }, []);

  useEffect(() => {
    const loaded = loadRegionStore();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setStore(loaded);
    onStoreChangeRef.current?.(loaded);
    for (const region of loaded.regions) {
      void loadName(region.sigunCode);
    }
  }, [loadName]);

  const applyStore = (next: RegionStore) => {
    setStore(next);
    onStoreChangeRef.current?.(next);
  };

  if (store === null) {
    return null;
  }

  if (store.regions.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>아직 등록한 지역이 없어요.</p>
        <p className={styles.emptyHint}>
          주소를 검색해서 우리 지역을 등록해 주세요.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {store.regions.map((region, index) => {
        const nameState = names[region.sigunCode] ?? LOADING_NAME;
        const displayName =
          nameState.kind === "ready" ? nameState.sigunName : region.sigunCode;
        return (
          <li key={region.sigunCode} className={styles.item}>
            <button
              type="button"
              className={styles.selectButton}
              aria-pressed={index === store.currentIndex}
              onClick={() => applyStore(selectRegion(index))}
            >
              {nameState.kind === "loading" ? (
                <Skeleton width="140px" height="24px" />
              ) : nameState.kind === "ready" ? (
                <>
                  <strong className={styles.name}>{nameState.sigunName}</strong>
                  <span className={styles.caption}>
                    우리 지역 대표 저수지 · {nameState.reservoirName}
                  </span>
                </>
              ) : (
                <>
                  <strong className={styles.name}>{region.sigunCode}</strong>
                  <span className={styles.caption}>
                    지역 정보를 불러오지 못했어요.
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              className={styles.deleteButton}
              aria-label={`${displayName} 삭제`}
              onClick={() => applyStore(removeRegion(region.sigunCode))}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
