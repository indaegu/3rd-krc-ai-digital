"use client";

// 주소 검색 → 시군구 확정 → 우리 지역 대표 저수지 확인 → 등록 플로우.
// 주소 원문·검색어는 화면 표시와 요청에만 쓰고 등록 후 어디에도 저장하지 않는다.

import type {
  RegionCandidate,
  RegionResolveResponse,
} from "@mulsigye/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { resolveRegion, searchRegions } from "../lib/client/api-client";
import {
  addRegion,
  currentRegion,
  loadRegionStore,
  selectRegion,
} from "../lib/client/region-store";
import styles from "./AddressSearch.module.css";
import { BottomSheet } from "./ui/BottomSheet";
import { Card } from "./ui/Card";
import { CtaButton } from "./ui/CtaButton";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; candidates: RegionCandidate[] }
  | { kind: "error"; message: string; retryable: boolean };

type ResolveState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: RegionResolveResponse }
  | { kind: "error"; message: string; retryable: boolean };

export function AddressSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({
    kind: "idle",
  });
  const [selected, setSelected] = useState<RegionCandidate | null>(null);
  const [resolveState, setResolveState] = useState<ResolveState>({
    kind: "idle",
  });
  const [registering, setRegistering] = useState(false);
  // "기본 주소지로 설정" — 새 지역을 대표 지역으로 지정할지. 기존 대표 로직
  // (addRegion/selectRegion, currentIndex)에 연결한다. 새 저장 필드는 만들지 않는다.
  const [setAsDefault, setSetAsDefault] = useState(true);

  // 늦게 도착한 이전 요청 응답이 최신 상태를 덮지 않도록 요청마다 번호를 매긴다.
  const searchIdRef = useRef(0);
  const resolveIdRef = useRef(0);

  const runSearch = useCallback(async (term: string) => {
    const requestId = ++searchIdRef.current;
    resolveIdRef.current += 1;
    setSearchState({ kind: "loading" });
    setSelected(null);
    setResolveState({ kind: "idle" });

    const result = await searchRegions(term);
    if (requestId !== searchIdRef.current) {
      return;
    }
    if (result.kind === "ok") {
      setSearchState({ kind: "ready", candidates: result.data.candidates });
    } else {
      setSearchState({
        kind: "error",
        message: result.message,
        retryable: result.retryable,
      });
    }
  }, []);

  // 검색 입력 300ms 디바운스.
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      return;
    }
    const timer = setTimeout(() => {
      void runSearch(term);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      searchIdRef.current += 1;
      resolveIdRef.current += 1;
      setSearchState({ kind: "idle" });
      setSelected(null);
      setResolveState({ kind: "idle" });
    }
  };

  const runResolve = useCallback(async (candidate: RegionCandidate) => {
    const requestId = ++resolveIdRef.current;
    setSelected(candidate);
    setResolveState({ kind: "loading" });

    const result = await resolveRegion({
      admCd: candidate.admCd,
      legalCode: candidate.legalCode,
    });
    if (requestId !== resolveIdRef.current) {
      return;
    }
    if (result.kind === "ok") {
      setResolveState({ kind: "ready", data: result.data });
    } else {
      setResolveState({
        kind: "error",
        message: result.message,
        retryable: result.retryable,
      });
    }
  }, []);

  const handleRegister = () => {
    if (registering || resolveState.kind !== "ready") {
      return;
    }
    const { sigunCode, prepared, reservoir } = resolveState.data;
    if (!prepared || sigunCode === null || reservoir === null) {
      return;
    }
    // 등록 버튼 내부 스피너 + 중복 입력 잠금. 저장은 코드 2개만.
    setRegistering(true);
    // 기존 대표 지역을 미리 잡아둔다("기본 주소지로 설정"을 끄면 유지하기 위함).
    const previousRepresentative = currentRegion(loadRegionStore());
    // addRegion은 추가한 지역을 곧 대표(currentIndex)로 만든다.
    const nextStore = addRegion({ sigunCode, facCode: reservoir.facCode });
    if (!setAsDefault && previousRepresentative !== null) {
      // 기본 주소지로 두지 않기로 했다면 이전 대표 지역을 다시 선택해 유지한다.
      const keepIndex = nextStore.regions.findIndex(
        (item) => item.sigunCode === previousRepresentative.sigunCode,
      );
      if (keepIndex >= 0) {
        selectRegion(keepIndex);
      }
    }
    router.replace("/regions");
  };

  return (
    <div className={styles.root}>
      <div className={styles.field}>
        {/* 시안(§10): 떠 있는 라벨 없이 입력 예시만 보이게 한다. 라벨은 화면에서만 감추고
            스크린리더에는 그대로 읽히도록 남긴다(접근 가능한 이름 유지). */}
        <label className={styles.srOnlyLabel} htmlFor="address-search-query">
          도로명주소 검색
        </label>
        <input
          id="address-search-query"
          className={styles.input}
          type="text"
          autoComplete="off"
          placeholder="예) 미래로 11"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
        />
        <p className={styles.hint}>
          도로명주소로 검색하면 우리 지역을 찾아드려요.
        </p>
      </div>

      {searchState.kind === "loading" ? (
        <p className={styles.statusRow} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          주소를 찾고 있어요…
        </p>
      ) : null}

      {searchState.kind === "error" ? (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorMessage}>{searchState.message}</p>
          {searchState.retryable ? (
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => void runSearch(query.trim())}
            >
              다시 시도하기
            </button>
          ) : null}
        </div>
      ) : null}

      {searchState.kind === "ready" && searchState.candidates.length === 0 ? (
        <p className={styles.emptyResult}>
          검색 결과가 없어요. 도로명주소를 다시 확인해 주세요.
        </p>
      ) : null}

      {searchState.kind === "ready" && searchState.candidates.length > 0 ? (
        <ul className={styles.candidateList}>
          {searchState.candidates.map((candidate) => (
            <li key={`${candidate.admCd}-${candidate.legalCode}`}>
              <button
                type="button"
                className={styles.candidateButton}
                aria-pressed={
                  selected !== null && selected.admCd === candidate.admCd
                }
                onClick={() => void runResolve(candidate)}
              >
                {candidate.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {resolveState.kind === "loading" ? (
        <p className={styles.statusRow} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          대표 저수지를 확인하고 있어요…
        </p>
      ) : null}

      {resolveState.kind === "error" ? (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorMessage}>{resolveState.message}</p>
          {resolveState.retryable && selected !== null ? (
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => {
                if (selected !== null) {
                  void runResolve(selected);
                }
              }}
            >
              다시 시도하기
            </button>
          ) : null}
        </div>
      ) : null}

      {resolveState.kind === "ready" &&
      !(resolveState.data.prepared && resolveState.data.reservoir !== null) ? (
        <Card className={styles.confirmCard}>
          <h2 className={styles.confirmTitle}>이 지역은 아직 준비 중이에요</h2>
          <p className={styles.confirmHint}>
            지금은 다른 주소로 등록해 주세요.
          </p>
          <CtaButton disabled>등록하기</CtaButton>
        </Card>
      ) : null}

      {/* 등록 확인 시트(§10) — 상단 radius 24 + 딤 + blur. */}
      <BottomSheet
        open={
          resolveState.kind === "ready" &&
          resolveState.data.prepared &&
          resolveState.data.reservoir !== null
        }
        label="주소 등록"
        onClose={() => setResolveState({ kind: "idle" })}
        dimClassName={styles.sheetDim}
      >
        {resolveState.kind === "ready" &&
        resolveState.data.reservoir !== null ? (
          <div className={styles.confirmSheet}>
            <h2 className={styles.confirmTitle}>이 주소로 등록할까요?</h2>
            {selected !== null ? (
              <p className={styles.address}>{selected.label}</p>
            ) : null}
            <p className={styles.reservoir}>
              우리 지역 대표 저수지 · {resolveState.data.reservoir.name}
            </p>
            <label className={styles.defaultRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={setAsDefault}
                onChange={(event) => setSetAsDefault(event.target.checked)}
              />
              <span>기본 주소지로 설정</span>
            </label>
            <CtaButton busy={registering} onClick={handleRegister}>
              등록하기
            </CtaButton>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
