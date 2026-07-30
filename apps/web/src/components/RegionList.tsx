"use client";

// 등록 지역 리스트 — 선택·관리 모드(순서 변경·기본 주소지 지정·삭제). 저장소에는 코드만
// 있으므로 지역 이름·대표 저수지명은 /api/v1/status를 병렬 호출해 표시한다.
//
// 관리 모드는 항목을 길게 눌러 들어간다(product.md #3b). 일반 모드 상단에 액션 버튼을 두면
// 매번 보이는 버튼이 늘어 고령 사용자에게 화면이 복잡해지기 때문이다. 길게 누르기를 쓸 수
// 없는 사용자를 위해 각 줄에 화면에 보이지 않는 "지역 관리" 버튼을 두어 같은 곳으로 들어간다.
//
// 드래그 대신 위로/아래로 버튼을 쓴다. 드래그는 키보드·스크린리더로 못 하고, 손이 떨리는
// 사용자에게도 어렵다. 순서 변경의 결과는 드래그와 같다(맨 위가 기본 주소지).
//
// 관리 모드에서는 체크박스로 여러 곳을 골라 한 번에 지울 수 있다. 지역을 여럿 등록한
// 사용자가 정리할 때 한 줄씩 열고 확인하기를 반복하지 않게 한다.

import { useCallback, useEffect, useRef, useState } from "react";

import { getStatus } from "../lib/client/api-client";
import {
  loadRegionStore,
  moveRegion,
  removeRegions,
  selectRegion,
  setPrimaryRegion,
  type RegionStore,
} from "../lib/client/region-store";
import { BottomSheet } from "./ui/BottomSheet";
import { CtaButton } from "./ui/CtaButton";
import styles from "./RegionList.module.css";
import { Skeleton } from "./ui/Skeleton";

type NameState =
  | { kind: "loading" }
  | { kind: "ready"; sigunName: string; reservoirName: string }
  | { kind: "error" };

const LOADING_NAME: NameState = { kind: "loading" };

/** 길게 누르기로 인정하는 시간. 스크롤하다 잘못 들어가지 않을 만큼 길게 잡는다. */
const LONG_PRESS_MS = 500;

/** 페이지가 CTA를 판단하는 데 필요한 것들. 저장소만으로는 이름 로딩 여부를 알 수 없다. */
export interface RegionListStatus {
  /** 등록된 지역이 하나라도 있는지. */
  hasRegions: boolean;
  /**
   * 지금 선택된 지역의 이름을 아직 불러오는 중인지.
   *
   * 이 상태로 메인에 들어가면 지역 이름 자리가 빈 채로 화면이 열리고, 조회가 실패했을
   * 때는 빈 화면에서 오류를 만난다. 여기서 기다렸다 들어가는 편이 낫다.
   */
  currentLoading: boolean;
}

interface RegionListProps {
  /** 저장소가 바뀔 때마다(마운트 포함) 호출한다. 페이지가 CTA 노출 판단에 쓴다. */
  onStoreChange?: (store: RegionStore) => void;
  /** 저장소 또는 이름 로딩 상태가 바뀔 때마다 호출한다. */
  onStatusChange?: (status: RegionListStatus) => void;
}

export function RegionList({ onStoreChange, onStatusChange }: RegionListProps) {
  const [store, setStore] = useState<RegionStore | null>(null);
  const [names, setNames] = useState<Record<string, NameState>>({});
  const [manageMode, setManageMode] = useState(false);
  /** 관리 모드에서 체크한 시군 코드. 관리 모드를 나가면 비운다. */
  const [selected, setSelected] = useState<string[]>([]);
  /** 확인 시트가 지울 대상. null이면 시트가 닫혀 있다. 한 건도 여러 건도 같은 흐름을 쓴다. */
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const onStoreChangeRef = useRef(onStoreChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 길게 눌러 관리 모드로 들어간 직후의 click은 선택으로 치지 않는다.
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    onStoreChangeRef.current = onStoreChange;
    onStatusChangeRef.current = onStatusChange;
  }, [onStoreChange, onStatusChange]);

  // 선택된 지역의 이름이 준비됐는지는 store와 names가 함께 바뀔 때마다 다시 판단한다.
  useEffect(() => {
    if (store === null) return;
    const current = store.regions[store.currentIndex];
    onStatusChangeRef.current?.({
      hasRegions: store.regions.length > 0,
      currentLoading:
        current !== undefined &&
        (names[current.sigunCode] ?? LOADING_NAME).kind === "loading",
    });
  }, [store, names]);

  // facCode: 저장된 선택 저수지. 넘기지 않으면 목록이 시군 기본 저수지 이름을 보여줘
  // 메인 화면과 달라진다(사용자가 다른 저수지를 골랐을 때).
  const loadName = useCallback(async (sigunCode: string, facCode?: string) => {
    const result = await getStatus(
      sigunCode,
      facCode === undefined ? {} : { facCode },
    );
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
      void loadName(region.sigunCode, region.facCode);
    }
  }, [loadName]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
    },
    [],
  );

  const applyStore = (next: RegionStore) => {
    setStore(next);
    onStoreChangeRef.current?.(next);
  };

  const startLongPress = () => {
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setManageMode(true);
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  if (store === null) {
    return null;
  }

  // 등록된 지역이 없으면 별도 안내 카드를 두지 않는다(상단 안내가 이미 설명하고,
  // 페이지의 "지역 추가하기"만 보이면 충분하다).
  if (store.regions.length === 0) {
    return null;
  }

  const nameOf = (sigunCode: string): string => {
    const state = names[sigunCode] ?? LOADING_NAME;
    return state.kind === "ready" ? state.sigunName : sigunCode;
  };

  const closeManageMode = () => {
    setManageMode(false);
    setSelected([]);
  };

  const toggleSelection = (sigunCode: string) => {
    setSelected((prev) =>
      prev.includes(sigunCode)
        ? prev.filter((code) => code !== sigunCode)
        : [...prev, sigunCode],
    );
  };

  const confirmDelete = () => {
    if (pendingDelete === null) return;
    const next = removeRegions(pendingDelete);
    setSelected((prev) => prev.filter((code) => !pendingDelete.includes(code)));
    setPendingDelete(null);
    applyStore(next);
    // 마지막 한 줄까지 지우면 관리할 것이 없다.
    if (next.regions.length === 0) {
      closeManageMode();
    }
  };

  return (
    <>
      {manageMode ? (
        <div className={styles.manageBar}>
          <p className={styles.manageHint} role="status">
            {selected.length === 0
              ? "순서를 바꾸거나 지울 수 있어요."
              : `${String(selected.length)}곳을 골랐어요.`}
          </p>
          <span className={styles.manageActions}>
            <button
              type="button"
              className={styles.manageDelete}
              disabled={selected.length === 0}
              onClick={() => {
                setPendingDelete(selected);
              }}
            >
              고른 지역 지우기
            </button>
            <button
              type="button"
              className={styles.manageDone}
              onClick={closeManageMode}
            >
              완료
            </button>
          </span>
        </div>
      ) : null}

      <ul className={styles.list}>
        {store.regions.map((region, index) => {
          const nameState = names[region.sigunCode] ?? LOADING_NAME;
          const displayName = nameOf(region.sigunCode);
          const isCurrent = index === store.currentIndex;
          // 기본 주소지 = 목록 맨 위(index 0). 선택(currentIndex)과 구분한다.
          const isPrimary = index === 0;
          return (
            <li
              key={region.sigunCode}
              className={
                isCurrent ? `${styles.item} ${styles.itemCurrent}` : styles.item
              }
            >
              {manageMode ? (
                <label className={styles.checkCell}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selected.includes(region.sigunCode)}
                    onChange={() => {
                      toggleSelection(region.sigunCode);
                    }}
                  />
                  <span className={styles.srOnlyText}>{displayName} 선택</span>
                </label>
              ) : null}
              <button
                type="button"
                className={styles.selectButton}
                aria-pressed={isCurrent}
                onPointerDown={startLongPress}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onClick={() => {
                  // 길게 눌러 관리 모드로 들어간 직후이거나 관리 중이면 선택하지 않는다.
                  if (longPressFiredRef.current) {
                    longPressFiredRef.current = false;
                    return;
                  }
                  if (manageMode) return;
                  applyStore(selectRegion(index));
                }}
              >
                {nameState.kind === "loading" ? (
                  <Skeleton width="140px" height="24px" />
                ) : nameState.kind === "ready" ? (
                  <span className={styles.rowMain}>
                    <strong className={styles.name}>
                      {nameState.sigunName}
                    </strong>
                    <span className={styles.reservoir}>
                      {nameState.reservoirName}
                    </span>
                    {isPrimary ? (
                      <span className={styles.badge}>기본 주소지</span>
                    ) : null}
                    {isCurrent ? (
                      <span className={styles.currentMark}>
                        <span aria-hidden="true">✓</span> 지금 보는 곳
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className={styles.rowMain}>
                    <strong className={styles.name}>{region.sigunCode}</strong>
                    <span className={styles.errorCaption}>
                      지역 정보를 불러오지 못했어요.
                    </span>
                  </span>
                )}
              </button>

              {manageMode ? (
                <span className={styles.actions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`${displayName} 위로 이동`}
                    disabled={index === 0}
                    onClick={() => {
                      applyStore(moveRegion(index, index - 1));
                    }}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`${displayName} 아래로 이동`}
                    disabled={index === store.regions.length - 1}
                    onClick={() => {
                      applyStore(moveRegion(index, index + 1));
                    }}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`${displayName}을(를) 기본 주소지로`}
                    disabled={isPrimary}
                    onClick={() => {
                      applyStore(setPrimaryRegion(region.sigunCode));
                    }}
                  >
                    <span aria-hidden="true">★</span>
                  </button>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    aria-label={`${displayName} 삭제`}
                    onClick={() => {
                      setPendingDelete([region.sigunCode]);
                    }}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              ) : (
                // 길게 누르기를 쓸 수 없는 사용자(키보드·스크린리더)의 관리 모드 진입점.
                <button
                  type="button"
                  className={styles.srOnlyButton}
                  onClick={() => {
                    setManageMode(true);
                  }}
                >
                  {displayName} 지역 관리
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <BottomSheet
        open={pendingDelete !== null}
        label="지역 삭제 확인"
        onClose={() => {
          setPendingDelete(null);
        }}
      >
        {pendingDelete !== null ? (
          <div className={styles.confirmSheet}>
            {/* 되돌릴 수 없는 삭제라 한 번 묻는다. 잘못 눌러 지운 지역은 주소부터 다시 찾아야 한다. */}
            <h2 className={styles.confirmTitle}>
              {pendingDelete.length === 1
                ? `${nameOf(pendingDelete[0] ?? "")}을(를) 지울까요?`
                : `${String(pendingDelete.length)}곳을 지울까요?`}
            </h2>
            {pendingDelete.length > 1 ? (
              // 무엇이 사라지는지 눈으로 확인하게 한다 — 체크를 잘못 눌렀을 수 있다.
              <p className={styles.confirmList}>
                {pendingDelete.map((code) => nameOf(code)).join(", ")}
              </p>
            ) : null}
            <p className={styles.confirmHint}>
              지우면 이 기기에 남은 지역 정보도 함께 사라져요. 다시 등록하려면
              주소나 저수지 이름으로 찾아야 해요.
            </p>
            <CtaButton onClick={confirmDelete}>지우기</CtaButton>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => {
                setPendingDelete(null);
              }}
            >
              그대로 두기
            </button>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
