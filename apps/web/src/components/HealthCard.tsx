"use client";

import type { HealthResponse } from "@mulsigye/contracts";
import { useCallback, useEffect, useState } from "react";

import styles from "./HealthCard.module.css";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; data: HealthResponse }
  | { kind: "error" };

export function HealthCard() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });

    try {
      const response = await fetch("/api/v1/health", {
        cache: "no-store",
        signal: signal ?? null
      });

      if (!response.ok) {
        throw new Error(`health request failed: ${response.status}`);
      }

      const data = (await response.json()) as HealthResponse;
      setState({ kind: "ready", data });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount stores the async health result in state
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.kind === "loading") {
    return <p className={styles.message}>물시계를 준비하고 있어요.</p>;
  }

  if (state.kind === "error") {
    return (
      <section className={styles.card} aria-live="polite">
        <h2>서버 연결을 확인해 주세요.</h2>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button className={styles.button} type="button" onClick={() => void load()}>
          다시 시도하기
        </button>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-live="polite">
      <h2>물시계 서버와 연결됐어요.</h2>
      <p>
        {state.data.stale
          ? "최근 확인한 정보를 보여드려요."
          : "최신 정보를 받을 준비가 됐어요."}
      </p>
    </section>
  );
}
