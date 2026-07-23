// 테스트 전용 인메모리 Supabase 대역 — 실 Supabase를 호출하지 않는다.
// coach_cache·coach_generation_locks·llm_usage 세 테이블의 조회/삽입/갱신/삭제/upsert를
// 결정적으로 흉내 낸다. 터미널 실행은 `then`(await 시점)에서 동기적으로 일어나므로
// 같은 마이크로태스크 안에서 원자적이다 — 동시 miss lock 경쟁을 재현할 수 있다.
// 프로덕션 코드가 아니라 vitest 대역이며, 앱 번들에 포함되지 않는다.
import type { CoachQueryResult, CoachSupabaseClient } from "./coach-cache.ts";

type Row = Record<string, unknown>;
type FilterOp = "eq" | "gte" | "lt" | "neq";
type Filter = { op: FilterOp; col: string; val: string | number };

type Store = {
  tables: Record<string, Row[]>;
  seq: number;
};

function matches(row: Row, filters: readonly Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.col];
    if (f.op === "eq") return v === f.val;
    if (f.op === "neq") return v !== f.val;
    if (f.op === "gte")
      return typeof v === "string" || typeof v === "number"
        ? v >= f.val
        : false;
    // lt
    return typeof v === "string" || typeof v === "number" ? v < f.val : false;
  });
}

function project(rows: readonly Row[], cols: string | undefined): Row[] {
  if (cols === undefined || cols === "*") return rows.map((r) => ({ ...r }));
  const wanted = cols.split(",").map((s) => s.trim());
  return rows.map((r) => {
    const o: Row = {};
    for (const c of wanted) o[c] = r[c];
    return o;
  });
}

class FakeBuilder implements PromiseLike<CoachQueryResult> {
  private action: "select" | "insert" | "upsert" | "update" | "delete" =
    "select";
  private rows: Row[] = [];
  private patch: Row = {};
  private filters: Filter[] = [];
  private selectCols: string | undefined;
  private wantCount = false;
  private headOnly = false;
  private onConflict: string | undefined;
  private wantSelectAfterWrite = false;
  private limitN: number | undefined;

  constructor(
    private readonly store: Store,
    private readonly table: string,
    private readonly failing: boolean,
  ) {}

  select(cols?: string, options?: { count?: "exact"; head?: boolean }): this {
    this.selectCols = cols;
    if (options?.count === "exact") this.wantCount = true;
    if (options?.head === true) this.headOnly = true;
    if (this.action !== "select") this.wantSelectAfterWrite = true;
    return this;
  }

  insert(rows: Row[]): this {
    this.action = "insert";
    this.rows = rows;
    return this;
  }

  upsert(rows: Row[], options?: { onConflict?: string }): this {
    this.action = "upsert";
    this.rows = rows;
    this.onConflict = options?.onConflict;
    return this;
  }

  update(patch: Row): this {
    this.action = "update";
    this.patch = patch;
    return this;
  }

  delete(): this {
    this.action = "delete";
    return this;
  }

  eq(col: string, val: string | number): this {
    this.filters.push({ op: "eq", col, val });
    return this;
  }

  neq(col: string, val: string | number): this {
    this.filters.push({ op: "neq", col, val });
    return this;
  }

  gte(col: string, val: string): this {
    this.filters.push({ op: "gte", col, val });
    return this;
  }

  lt(col: string, val: string): this {
    this.filters.push({ op: "lt", col, val });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private table_(): Row[] {
    const t = this.store.tables[this.table];
    if (t !== undefined) return t;
    const created: Row[] = [];
    this.store.tables[this.table] = created;
    return created;
  }

  private execute(): CoachQueryResult {
    if (this.failing) {
      return { data: null, error: { message: "supabase down" }, count: null };
    }
    const t = this.table_();

    if (this.action === "insert" || this.action === "upsert") {
      const inserted: Row[] = [];
      for (const r of this.rows) {
        if (this.action === "upsert" && this.onConflict !== undefined) {
          const key = this.onConflict;
          const idx = t.findIndex((x) => x[key] === r[key]);
          if (idx >= 0) {
            t[idx] = { ...t[idx], ...r };
            continue;
          }
        }
        // coach_generation_locks.cache_key는 primary key — 중복이면 23505.
        if (
          this.action === "insert" &&
          this.table === "coach_generation_locks" &&
          t.some((x) => x["cache_key"] === r["cache_key"])
        ) {
          return {
            data: null,
            error: { message: "duplicate key", code: "23505" },
            count: null,
          };
        }
        const row: Row = { ...r };
        if (this.table === "llm_usage" && row["id"] === undefined) {
          this.store.seq += 1;
          row["id"] = this.store.seq;
        }
        t.push(row);
        inserted.push(row);
      }
      return {
        data: this.wantSelectAfterWrite
          ? project(inserted, this.selectCols)
          : null,
        error: null,
        count: null,
      };
    }

    const matched = t.filter((r) => matches(r, this.filters));

    if (this.action === "update") {
      for (const r of matched) Object.assign(r, this.patch);
      return {
        data: this.wantSelectAfterWrite
          ? project(matched, this.selectCols)
          : null,
        error: null,
        count: null,
      };
    }

    if (this.action === "delete") {
      this.store.tables[this.table] = t.filter(
        (r) => !matches(r, this.filters),
      );
      return { data: null, error: null, count: null };
    }

    // select
    if (this.headOnly || this.wantCount) {
      return { data: null, error: null, count: matched.length };
    }
    const limited =
      this.limitN === undefined ? matched : matched.slice(0, this.limitN);
    return {
      data: project(limited, this.selectCols),
      error: null,
      count: null,
    };
  }

  then<TResult1 = CoachQueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: CoachQueryResult) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    // execute()가 await 시점에 동기 실행되어 쓰기가 원자적이다.
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export type FakeCoachSupabase = CoachSupabaseClient & {
  tables: Record<string, Row[]>;
  seed(table: string, rows: Row[]): void;
};

/** 인메모리 대역 클라이언트를 만든다. `failing`이면 모든 연산이 오류를 반환한다. */
export function createFakeCoachSupabase(
  options: { failing?: boolean } = {},
): FakeCoachSupabase {
  const store: Store = { tables: {}, seq: 0 };
  const failing = options.failing === true;
  return {
    from(table: string) {
      return new FakeBuilder(store, table, failing);
    },
    tables: store.tables,
    seed(table: string, rows: Row[]) {
      const existing = store.tables[table] ?? [];
      store.tables[table] = existing.concat(rows.map((r) => ({ ...r })));
    },
  };
}
