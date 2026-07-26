"use client";

// 저수지 이름으로 지역 등록 — 주소를 몰라도 아는 저수지 이름으로 찾게 한다.
//
// 넓은 시군에서는 주소만으로 원하는 저수지가 잡히지 않을 수 있다(실측: 제주시 5곳).
// 여기서 고른 저수지는 기기에 facCode로 저장되고, status 조회에 함께 실려 그 저수지가
// 유지된다 — 서버가 규칙대로 다시 고르지 않는다.
//
// 이 경로는 도로명주소 API를 부르지 않는다(커밋 스냅샷 조회). 주소 원문도 다루지 않는다.

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { searchReservoirs } from "../lib/client/api-client";
import { addRegion, setPrimaryRegion } from "../lib/client/region-store";
import { BottomSheet } from "./ui/BottomSheet";
import { Card } from "./ui/Card";
import { CtaButton } from "./ui/CtaButton";
import styles from "./AddressSearch.module.css";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/** 서버 응답의 저수지 후보 한 건. */
type Hit = {
  facCode: string;
  name: string;
  address: string | null;
  sigunCode: string;
  sigunName: string | null;
  prepared: boolean;
};

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; hits: Hit[] }
  | { kind: "error"; message: string; retryable: boolean };

export function ReservoirSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ kind: "idle" });
  const [selected, setSelected] = useState<Hit | null>(null);
  const [registering, setRegistering] = useState(false);
  // 주소 경로와 같은 기본값 — 새로 등록한 지역을 대표 지역으로 올린다.
  const [setAsDefault, setSetAsDefault] = useState(true);

  // 늦게 도착한 이전 응답이 최신 상태를 덮지 않도록 요청마다 번호를 매긴다.
  const searchIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (term: string) => {
    const requestId = ++searchIdRef.current;
    setSearchState({ kind: "loading" });
    setSelected(null);

    const result = await searchReservoirs(term);
    if (requestId !== searchIdRef.current) {
      return;
    }
    if (result.kind === "ok") {
      setSearchState({ kind: "ready", hits: result.data.reservoirs });
    } else {
      setSearchState({
        kind: "error",
        message: result.message,
        retryable: result.retryable,
      });
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    const term = value.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      searchIdRef.current += 1;
      setSearchState({ kind: "idle" });
      setSelected(null);
      return;
    }
    timerRef.current = setTimeout(() => {
      void runSearch(term);
    }, DEBOUNCE_MS);
  };

  const handleRegister = () => {
    if (registering || selected === null || !selected.prepared) {
      return;
    }
    setRegistering(true);
    // 저장은 코드 2개뿐이다(시군 + 시설). 이름·소재지는 저장하지 않는다.
    addRegion({ sigunCode: selected.sigunCode, facCode: selected.facCode });
    if (setAsDefault) {
      setPrimaryRegion(selected.sigunCode);
    }
    router.replace("/regions");
  };

  return (
    <div className={styles.root}>
      <div className={styles.field}>
        <label className={styles.srOnlyLabel} htmlFor="reservoir-search-query">
          저수지 이름 검색
        </label>
        <input
          id="reservoir-search-query"
          className={styles.input}
          type="text"
          autoComplete="off"
          placeholder="예) 탑정"
          value={query}
          onChange={(event) => {
            handleQueryChange(event.target.value);
          }}
        />
        <p className={styles.hint}>
          알고 있는 저수지 이름으로 찾아 바로 등록할 수 있어요.
        </p>
      </div>

      {searchState.kind === "loading" ? (
        <p className={styles.statusRow} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          저수지를 찾고 있어요…
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

      {searchState.kind === "ready" && searchState.hits.length === 0 ? (
        <p className={styles.emptyResult}>
          찾는 저수지가 없어요. 이름을 다시 확인해 주세요.
        </p>
      ) : null}

      {searchState.kind === "ready" && searchState.hits.length > 0 ? (
        <ul className={styles.candidateList}>
          {searchState.hits.map((hit) => (
            <li key={hit.facCode}>
              <button
                type="button"
                className={styles.candidateButton}
                aria-pressed={selected?.facCode === hit.facCode}
                // 준비되지 않은 시군은 고를 수 없다 — 감추지 않고 이유를 보여준다.
                disabled={!hit.prepared}
                onClick={() => {
                  setSelected(hit);
                }}
              >
                <b>
                  {hit.name} 저수지
                  {hit.sigunName === null ? "" : ` · ${hit.sigunName}`}
                </b>
                <span className={styles.candidateSub}>
                  {hit.prepared
                    ? (hit.address ?? "")
                    : "이 지역은 아직 준비 중이에요"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected !== null && !selected.prepared ? (
        <Card className={styles.confirmCard}>
          <h2 className={styles.confirmTitle}>이 지역은 아직 준비 중이에요</h2>
          <p className={styles.confirmHint}>다른 저수지를 골라 주세요.</p>
          <CtaButton disabled>등록하기</CtaButton>
        </Card>
      ) : null}

      <BottomSheet
        open={selected !== null && selected.prepared}
        label="저수지 등록"
        onClose={() => {
          setSelected(null);
        }}
        dimClassName={styles.sheetDim}
      >
        {selected !== null ? (
          <div className={styles.confirmSheet}>
            <h2 className={styles.confirmTitle}>이 저수지로 등록할까요?</h2>
            <p className={styles.address}>{selected.address ?? ""}</p>
            <p className={styles.reservoir}>
              {selected.sigunName ?? ""} · {selected.name} 저수지
            </p>
            <label className={styles.defaultRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={setAsDefault}
                onChange={(event) => {
                  setSetAsDefault(event.target.checked);
                }}
              />
              <span>기본 주소지로 설정</span>
            </label>
            <CtaButton onClick={handleRegister} disabled={registering}>
              {registering ? "등록 중…" : "등록하기"}
            </CtaButton>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
