# Mulsigye 단계 2 — KRC 데이터 파이프라인·Supabase 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans로 Task 단위 실행. 체크박스(`- [ ]`)로 진행을 추적한다.

- 상태: 사용자 승인 (2026-07-21)
- 작성일: 2026-07-21
- 확정 결정: 대표 3개 시군 = 논산시 44230·나주시 46170·기장군 26710 / 광역시 구 단위 주소는 "준비 중" 처리 / 스냅샷 범위는 플랜 기본값
- 근거: 실데이터 4종 CSV·수위 API 샘플 XML·Juso 샘플 JSON 실측 조사

**Goal:** KRC 공공데이터 4종 CSV를 결정적으로 정규화해 Supabase 4개 테이블(`reservoirs`, `reservoir_observations`, `regional_drought_daily`, `official_outlooks`)에 적재하고, 주소 검색 → 시군구 코드 → 우리 지역 대표 저수지 결정과 수위 API 3단 폴백(`API → Supabase 스냅샷 → 커밋 스냅샷`)을 `/api/v1/regions/*`·`/api/v1/status`로 노출한다. 완료 게이트: 대표 3개 시군의 주소가 항상 같은 대표 저수지 하나로 매칭되고, 수위 API 장애 시에도 status가 HTTP 200을 유지한다.

**Architecture:** 계약은 `packages/contracts/openapi.yaml`에 먼저 추가한다(v1 호환 확장만). 정규화·대표지 결정·폴백은 전부 `apps/web/src/lib/data`의 순수 함수 + 서버 전용 모듈로 구현하고, 적재 CLI는 같은 모듈을 재사용하기 위해 `apps/web/scripts/build-data.ts`(Node 24 네이티브 TS 실행)로 두되 루트 `pnpm build:data`가 `--filter @mulsigye/web`로 위임한다(`scripts/`에는 크로스 워크스페이스 검사만 유지 — architecture.md 폴더 설명을 같은 PR에서 동기화). Supabase는 append-only 마이그레이션 + RLS·무정책·revoke 패턴을 기존 coach 테이블과 동일하게 따르고, Docker 없는 로컬 대신 CI `supabase` job으로 검증한다.

**Tech Stack:** 기존 고정 버전 + `apps/web`에 `zod 4.4.3`, `fast-xml-parser`(구현일 안정 버전 고정), `@supabase/supabase-js`(2.x 고정) 추가. CSV 파서는 내장 구현(quote-aware 최소 구현), CP949 디코딩은 Node 내장 `TextDecoder("euc-kr")` — 새 인코딩 라이브러리를 추가하지 않는다.

## 실측 조사 결과 (플랜의 전제)

### CSV 실제 필드 vs docs/data-sources.md 차이

| 파일 | 실측 내용 | 문서와의 차이·주의 |
|---|---|---|
| 논가뭄지도 (CP949) | 헤더 `기준일자,시도명,시군명,시군코드,저수율(퍼센트),평년(퍼센트),평년대비(퍼센트),가뭄단계`. 167개 시군 × 365일 = 60,955행. 단계는 한국어 문자열 | 서울(11000)·부산(26000) 등 비농업 행정구는 `저수율=0, 평년=0, 평년대비=100` 플레이스홀더 행 — 격리 필요 |
| 시설제원_저수지 (CP949) | 헤더 26열(`표준코드,본부,지사,시설명,소재지,…,수혜면적,…`). 3,422행, `표준코드` 중복 0 | **시군코드 열이 없음.** `표준코드` 앞 5자리가 시군코드(탑정 `4423010045`→`44230` 논산 실측). 156개 prefix 중 42개는 광역시 구 단위 코드로 논가뭄지도에 없음 |
| 전국 저수지 일별 저수율 (**UTF-8 BOM**) | 헤더 `저수지명,위치,유효저수량,2025-01-01,…`(368열 wide). 3,463행 | **fac_code 없음** → (저수지명,위치)↔시설제원(시설명,소재지) 정확 일치 조인 필수. 실측 3,376/3,459 매칭(97.6%), 미매칭 83건·동명동위치 4쌍 격리 |
| 가뭄예경보 (CP949) | 헤더 `기준일자,시도명,시군명,행정구역코드,가뭄현황,가뭄전망1,가뭄전망2,가뭄전망3`. 월 1회 × 12회분. 코드는 논가뭄지도와 100% 일치 | 전망 값은 0~4 숫자 코드. **공식 정의 확인 완료(포털 컬럼 설명): 0=정상, 1=관심, 2=주의, 3=경계, 4=심각** |
| 수위 API XML | `check_date`(YYYYMMDD), `county`(후행 공백), `fac_code`, `fac_name`, `rate`, `water_level`, `returnReasonCode=00` | `check_date` 하이픈 없음 → KST 달력일 변환 |
| Juso JSON | 나주 `admCd="1217010200"`(신 "전남광주통합특별시" 체계), `bdMgtSn="4617010200…"` | **admCd 앞 5자리(12170)가 KRC 시군코드(46170)와 불일치** → admCd 우선 + bdMgtSn 앞 10자리(법정동코드) 폴백 2단 판정 |

### 스키마 설계 주의점

1. `reservoirs.sigun_code`는 `left(fac_code, 5)` 유도값 — Postgres generated column으로 드리프트 방지.
2. `reservoir_observations`는 연간 CSV·수위 API 두 원천이 같은 `(fac_code, observed_on)`에 쓸 수 있음 → `source` 열 + upsert 우선순위(api > csv).
3. `rate`·`avg_ratio`는 100 초과 실존(나주 140.1) — 상한 check 금지, `>= 0`만.
4. 광역시 구 단위 저수지(42개 prefix)는 `regional_drought_daily`에 대응 행이 없음 — sigun_code FK 금지.
5. `official_outlooks`는 0~4 smallint로 저장, 라벨 변환은 서버 한 곳(drought-stage.ts와 동일 매핑: 0=정상~4=심각).
6. RLS+무정책+revoke 패턴은 기존 `20260719000100`과 동일.

## Global Constraints

- 공인 가뭄단계는 평년 대비 70/60/50/40%(관심/주의/경계/심각)만 사용하고 임계값은 `apps/web/src/lib/data/drought-stage.ts` 한 곳에만 둔다. 원천 `가뭄단계`를 우선 표시하며, 계산값과 다르면 해당 행을 격리하고 리포트에 남긴다.
- 예측·확정 표현 금지. 이번 단계 API는 사실(관측값·공식 단계·공식 전망)만 반환한다.
- 주소 원문(`roadAddr`, `jibunAddr` 등)은 대표지 결정 후 폐기한다. Supabase·구조화 로그·적재 리포트에 저장하지 않는다(테스트로 강제).
- `DATA_GO_KR_API_KEY`는 디코딩 키이므로 호출 시 `encodeURIComponent` 필수. 엔드포인트는 원본 오타 그대로 `http://apis.data.go.kr/B552149/reserviorWaterLevel/reservoirlevel/`, 파라미터 `fac_code`/`date_s`/`date_e`/`pageNo`/`numOfRows`. 시설코드 조회 최대 365일. 60분 캐시.
- 4개 파일데이터는 연간 갱신 — cron 금지, 수동 CLI 적재만. 수위 API 정상 응답만 Supabase에 저장한다.
- 회원가입·로그인·알림 없음. 클라이언트는 `/api/v1/*`만 호출한다.
- 마이그레이션은 timestamp 오름차순 append-only. 서버 테이블은 RLS 활성 + 공개 정책 0개 + `anon, authenticated` revoke.
- 원천 필드명 해석은 `apps/web/src/lib/data` 밖에서 금지. 날짜는 KST 달력일 `YYYY-MM-DD`.
- 빈 문자열·`-`·비숫자는 `null`, 음수 저수율은 격리. `rate`·`avgRatio`는 100 초과를 잘라내지 않는다.
- 코드 변경과 문서 갱신(`data-sources.md`, `architecture.md`, `testing-and-feedback.md`, `tech-stack.md`)은 같은 커밋에 담는다.
- 작업 브랜치 `feat/stage2-data-pipeline`에서 검증·커밋·푸시 후 `main` 대상 PR을 만든다.

## 고정 원천 → 내부 필드 매핑 (실측 기준)

```text
논가뭄지도(CP949):      기준일자→observedOn, 시도명→sidoName, 시군명→sigunName,
                        시군코드→sigunCode, 저수율(퍼센트)→regionalRate,
                        평년(퍼센트)→normalRate, 평년대비(퍼센트)→avgRatio, 가뭄단계→officialStage
시설제원(CP949):        표준코드→facCode, 시설명→name, 소재지→address, 수혜면적→beneficiaryArea
                        (sigunCode는 facCode 앞 5자리 유도값)
일별 저수율(UTF-8 BOM): 저수지명+위치 → 시설제원 (시설명, 소재지) 정확 일치 조인으로 facCode 획득,
                        날짜 열 wide→long → (facCode, observedOn, rate)
가뭄예경보(CP949):      기준일자→publishedOn, 행정구역코드→sigunCode,
                        가뭄현황→currentLevel, 가뭄전망1/2/3→outlook1m/2m/3m (0~4 코드)
수위 API(XML):          check_date(YYYYMMDD)→observedOn, fac_code→facCode,
                        rate→rate, water_level→waterLevel (county는 trim 후 참고용, 저장 안 함)
Juso(JSON):             roadAddr→label(표시 후 폐기), admCd, bdMgtSn 앞 10자리→legalCode
```

## 고정 계약 DTO (v1 확장)

```ts
export type RegionCandidate = {
  label: string;        // 표시용 도로명주소. 서버에 저장 금지
  admCd: string;        // 10자리 행정구역코드
  legalCode: string;    // bdMgtSn 앞 10자리 법정동코드 (admCd 불일치 대비)
};

export type RegionResolveRequest = { admCd: string; legalCode: string };

export type RepresentativeReservoir = { facCode: string; name: string };

export type RegionResolveResponse = {
  schemaVersion: "1";
  sigunCode: string | null;
  sigunName: string | null;
  prepared: boolean;                       // false면 "이 지역은 준비 중이에요"
  reservoir: RepresentativeReservoir | null;
  asOf: string; sources: string[]; stale: boolean;
};

export type DroughtStageCode = "ok" | "watch" | "care" | "alert" | "crit";

export type StatusResponse = {
  schemaVersion: "1";
  sigunCode: string;
  sigunName: string;
  reservoir: {
    facCode: string; name: string;
    rate: number | null;                   // 원저수율 %
    waterLevel: number | null;
    observedOn: string | null;             // YYYY-MM-DD
  };
  region: {
    observedOn: string;
    regionalRate: number | null;
    normalRate: number | null;
    avgRatio: number;                      // 평년 대비 %, 100 초과 가능
    officialStage: { code: DroughtStageCode; label: "정상" | "관심" | "주의" | "경계" | "심각" };
  };
  asOf: string; sources: string[]; stale: boolean;
};
```

---

### Task 1: OpenAPI 계약 확장 — regions/search·resolve·status

**Files:**
- Modify: `packages/contracts/openapi.yaml`
- Create: `packages/contracts/examples/regions-search.ok.json`
- Create: `packages/contracts/examples/regions-resolve.ok.json`
- Create: `packages/contracts/examples/regions-resolve.not-ready.json`
- Create: `packages/contracts/examples/status.ok.json`
- Create: `packages/contracts/examples/status.stale.json`
- Modify: `packages/contracts/src/index.ts`
- Generate: `packages/contracts/src/generated/openapi.ts`
- Test: `packages/contracts/test/regions-contract.test.ts`, `packages/contracts/test/status-contract.test.ts`

**Interfaces:**
- Consumes: 기존 health 계약 스타일(`schemaVersion`/`asOf`/`sources`/`stale`, `ApiError`).
- Produces: `GET /api/v1/regions/search?q=`, `POST /api/v1/regions/resolve`, `GET /api/v1/status?sigunCode=` 스키마와 위 DTO. 기존 스키마는 변경하지 않는다(v1 호환 확장).

- [ ] **Step 1: 실패하는 계약 테스트 먼저**

위 DTO를 `satisfies`로 검사하는 두 테스트 파일과 examples JSON을 작성한다. `status.stale.json`은 `stale: true` + `sources`에 `"Supabase 스냅샷"` 표기, `regions-resolve.not-ready.json`은 `prepared: false, reservoir: null`.

Run: `pnpm --filter @mulsigye/contracts test`

Expected: FAIL — 생성 타입에 `RegionResolveResponse` 등이 없음.

- [ ] **Step 2: openapi.yaml에 세 경로 추가**

기존 스타일 그대로 `components/schemas`에 `RegionCandidate`, `RegionSearchResponse`, `RegionResolveRequest`, `RegionResolveResponse`, `RepresentativeReservoir`, `DroughtStage`, `StatusResponse`를 추가한다. 주의: `officialStage`는 `code`(UI 토큰) + `label`(한국어) 쌍, 거리 필드 금지, 명칭은 "우리 지역 대표 저수지". 오류 응답은 기존 `ApiError` 재사용(400/404/503).

- [ ] **Step 3: 타입 재생성·검증**

Run: `pnpm --filter @mulsigye/contracts generate` → `pnpm openapi:lint` → `pnpm --filter @mulsigye/contracts test` → `pnpm --filter @mulsigye/contracts typecheck`

Expected: 모두 PASS.

- [ ] **Step 4: Commit**

```powershell
git add packages/contracts
git commit -m "feat(contracts): regions·status v1 계약 추가"
```

---

### Task 2: Supabase 마이그레이션 — KRC 4개 테이블 + pgTAP

**Files:**
- Create: `infra/supabase/migrations/20260721000100_create_krc_data_tables.sql`
- Create: `infra/supabase/tests/krc_tables_test.sql`

**Interfaces:**
- Consumes: 기존 `20260719000100_create_llm_coach_tables.sql`의 RLS·revoke 패턴.
- Produces: 아래 스키마. 되돌려 쓰기 금지, 새 파일 추가만.

```sql
create table public.reservoirs (
  fac_code text primary key check (fac_code ~ '^[0-9]{10}$'),
  name text not null,
  address text,
  sigun_code text not null generated always as (left(fac_code, 5)) stored,
  beneficiary_area numeric check (beneficiary_area is null or beneficiary_area >= 0),
  effective_storage numeric check (effective_storage is null or effective_storage >= 0),
  source_file text not null,
  source_updated_on date not null,
  loaded_at timestamptz not null default now()
);
create index reservoirs_representative_idx
  on public.reservoirs (sigun_code, beneficiary_area desc nulls last, fac_code asc);

create table public.reservoir_observations (
  fac_code text not null references public.reservoirs (fac_code),
  observed_on date not null,
  rate numeric check (rate is null or rate >= 0),        -- 100 초과 허용
  water_level numeric,
  source text not null check (source in ('daily_csv', 'waterlevel_api')),
  loaded_at timestamptz not null default now(),
  primary key (fac_code, observed_on)
);

create table public.regional_drought_daily (
  sigun_code text not null check (sigun_code ~ '^[0-9]{5}$'),
  observed_on date not null,
  sido_name text not null,
  sigun_name text not null,
  regional_rate numeric check (regional_rate is null or regional_rate >= 0),
  normal_rate numeric check (normal_rate is null or normal_rate >= 0),
  avg_ratio numeric not null check (avg_ratio >= 0),     -- 140.1 실측, 상한 없음
  official_stage text not null
    check (official_stage in ('정상', '관심', '주의', '경계', '심각')),
  loaded_at timestamptz not null default now(),
  primary key (sigun_code, observed_on)
);

create table public.official_outlooks (
  sigun_code text not null check (sigun_code ~ '^[0-9]{5}$'),
  published_on date not null,
  sido_name text not null,
  sigun_name text not null,
  current_level smallint not null check (current_level between 0 and 4),
  outlook_1m smallint not null check (outlook_1m between 0 and 4),
  outlook_2m smallint not null check (outlook_2m between 0 and 4),
  outlook_3m smallint not null check (outlook_3m between 0 and 4),
  loaded_at timestamptz not null default now(),
  primary key (sigun_code, published_on)
);
-- 4개 테이블 모두: enable row level security + revoke all from anon, authenticated
```

주의: `reservoirs.sigun_code → regional_drought_daily` FK를 만들지 않는다(광역시 구 단위 코드 42종은 논가뭄지도에 없음 — 실측).

- [ ] **Step 1: pgTAP 테스트 먼저 작성**

`krc_tables_test.sql`: `has_table` ×4, `col_is_pk`(복합 PK 포함) ×4, RLS `relrowsecurity` ×4, `pg_policies` 0건 ×4, `reservoirs.sigun_code` generated 값 검증(`insert` 후 `left()` 일치), `official_stage`·`source` check 위반 `throws_ok` — 기존 `coach_tables_test.sql` 스타일로 `begin; … rollback;`.

- [ ] **Step 2: 마이그레이션 작성 후 정적 확인**

로컬에 Docker가 없으므로 실행 검증은 CI `supabase` job(start/reset/lint/pgTAP)에서 한다. 로컬에서 실행했다고 보고하지 않는다.

Run: `git diff --check` / `pnpm format:check`

Expected: PASS. (런타임 검증은 Task 7의 PR CI에서 확인)

- [ ] **Step 3: Commit**

```powershell
git add infra/supabase
git commit -m "feat(infra): KRC 데이터 4개 테이블 스키마 추가"
```

---

### Task 3: 정규화·대표지 결정 순수 모듈 (`apps/web/src/lib/data`)

**Files:**
- Create: `apps/web/src/lib/data/encoding.ts` (CP949 `TextDecoder("euc-kr")`·UTF-8 BOM 제거)
- Create: `apps/web/src/lib/data/csv.ts` (quote-aware 최소 CSV 파서)
- Create: `apps/web/src/lib/data/drought-stage.ts` (70/60/50/40 임계값 상수 + `officialStage` 한국어↔`code` 토큰 매핑 + `avgRatio`→단계 계산 — 검증용 + 예경보 0~4 코드 라벨 매핑)
- Create: `apps/web/src/lib/data/normalize-drought-map.ts`
- Create: `apps/web/src/lib/data/normalize-reservoir-spec.ts`
- Create: `apps/web/src/lib/data/normalize-daily-rate.ts` (wide→long + 시설제원 조인)
- Create: `apps/web/src/lib/data/normalize-outlook.ts`
- Create: `apps/web/src/lib/data/normalize-waterlevel-xml.ts` (fast-xml-parser + Zod)
- Create: `apps/web/src/lib/data/representative-reservoir.ts` (순수 함수)
- Create: `apps/web/src/lib/data/quarantine.ts` (격리 사유 코드·리포트 타입)
- Fixtures: `apps/web/test/fixtures/` (실CSV 앞 몇 행을 바이트 보존 복사 + 수위 XML·Juso JSON 샘플 복사)
- Test: 각 모듈별 `*.test.ts`
- Modify: `apps/web/package.json` (+ `zod@4.4.3`, `fast-xml-parser` 고정, `@supabase/supabase-js` 고정)

**Interfaces:**
- Produces: `(버퍼) → { rows: 내부 DTO[], quarantined: QuarantinedRow[] }` 형태의 결정적 함수와
  `pickRepresentativeReservoir(sigunCode, reservoirs[]) → Reservoir | null`.

- [ ] **Step 1: 픽스처를 바이트 보존으로 생성**

CP949 원본 바이트를 그대로 잘라 픽스처로 만든다(재인코딩 금지). 4개 CSV 동일 방식, XML·JSON은 그대로 복사.

- [ ] **Step 2: 실패하는 정규화 테스트 먼저**

핵심 케이스(testing-and-feedback 최소 범위 반영):
- CP949 헤더가 `기준일자,시도명,…`으로 디코딩됨 / UTF-8 BOM 제거.
- 논가뭄지도: `regionalRate=0 && normalRate=0` 행 격리(사유 `placeholder_region`), `officialStage`≠계산 단계 행 격리(`stage_mismatch`), `avgRatio 140.1` 보존, 경계값 70/60/50/40과 바로 위 값 전부.
- 시설제원: `sigunCode === facCode.slice(0, 5)` 유도, 수혜면적 숫자화(빈값·`-` → null).
- wide→long: 365개 날짜 열, 빈 셀 → 결측(행 생성 안 함), (이름,위치) 미매칭 격리(`no_spec_match`), 중복쌍 격리(`ambiguous_join`), 음수 격리(`negative_rate`).
- 예경보: 0~4 범위 밖 격리, 월 발행일 그대로 보존.
- 수위 XML: `check_date 20260714 → 2026-07-14`, `returnReasonCode !== "00"` 오류 매핑, `totalCount`/페이징 파싱.
- 대표지: 같은 시군구만 후보, `beneficiaryArea` 최대, 동률 `facCode` 오름차순, 후보 없음 → `null` (탑정 5713 > 가곡 207.7 실측 케이스 포함).

Run: `pnpm --filter @mulsigye/web test`

Expected: FAIL (모듈 미구현).

- [ ] **Step 3: 구현 후 전체 검증**

Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build`

Expected: 모두 PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/web packages pnpm-lock.yaml docs/tech-stack.md
git commit -m "feat(web): KRC 4종 CSV·수위 XML 정규화와 대표 저수지 결정 모듈"
```
(`tech-stack.md` 고정 버전 표에 zod·fast-xml-parser·supabase-js 추가 — 같은 커밋)

---

### Task 4: 적재 CLI `pnpm build:data` — 검증·격리·upsert·리포트·스냅샷

**Files:**
- Create: `apps/web/scripts/build-data.ts` (Node 24 네이티브 TS 실행, 상대 경로 import만)
- Create: `apps/web/src/lib/data/load-report.ts` (리포트 스키마 Zod)
- Create: `apps/web/src/lib/data/supabase-server.ts` (service role 클라이언트, 서버 전용)
- Modify: `apps/web/package.json` (`"build:data": "node scripts/build-data.ts"`)
- Modify: `package.json` (`"build:data": "pnpm --filter @mulsigye/web build:data"`)
- Generated(커밋 대상): `data/load-report.json`, `data/snapshots/sigun-index.json`, `data/snapshots/reservoirs.json`, `data/snapshots/regional-drought-daily.json`(전 시군 최근 60일), `data/snapshots/official-outlooks.json`(12회 전체), `data/snapshots/reservoir-observations.json`(시설별 최신 1건 + 대표 3개 시군 대표지 최근 30일)
- Test: `apps/web/test/build-data.test.ts` (dry-run 통합 테스트, Supabase 클라이언트 주입 mock)

**Interfaces:**
- Consumes: Task 3 정규화 모듈, `data/raw/*.csv`, `.env.local`(`SUPABASE_URL`, `SUPABASE_SECRET_KEY`).
- Produces: `pnpm build:data [--dry-run] [--skip-upsert]` — 파싱→검증→격리→(upsert)→스냅샷·리포트 작성. 리포트에 원천 파일명·포털 갱신일(파일명 suffix)·행 수·격리 수(사유별)·SHA-256 체크섬. upsert는 1,000행 배치, `onConflict` PK 기준.

- [ ] **Step 1: 실패 확인**

Run: `pnpm build:data -- --dry-run`

Expected: FAIL (스크립트 없음).

- [ ] **Step 2: 통합 테스트 먼저**

dry-run이 픽스처 디렉터리에서: (a) 리포트 JSON이 Zod 스키마에 맞고 체크섬·격리 사유별 카운트 포함, (b) 스냅샷 파일 생성, (c) upsert payload에 사용자 주소 원문 키가 없음(시설 `address`는 허용 — 사용자 주소가 아님), (d) 같은 입력 → 같은 출력(결정성, 체크섬 비교)을 검증.

- [ ] **Step 3: 구현 후 실데이터 dry-run**

Run: `pnpm build:data -- --dry-run` (data/raw 전체)

Expected: PASS — 콘솔 요약 예상치: 논가뭄지도 60,955행 중 placeholder 격리 수천 행(서울·광역시 0/0 행), 일별 저수율 미매칭 83시설·중복 4쌍 격리, 시설제원 3,422행 전량 적재.

Run: `pnpm --filter @mulsigye/web test && pnpm lint && pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: 산출물 커밋**

원격 upsert는 Task 7의 `db push` 이후 실행하므로, 이 시점에는 `--skip-upsert`로 스냅샷·리포트만 생성해 커밋한다. (`data/raw/`는 ignore 유지, 스냅샷·리포트는 커밋 대상 — .gitignore 예외 확인)

```powershell
git add apps/web package.json data/load-report.json data/snapshots
git commit -m "feat(web): KRC 데이터 적재 CLI와 제출 스냅샷 생성"
```

---

### Task 5: `/api/v1/regions/search`·`/api/v1/regions/resolve` Route Handlers

**Files:**
- Create: `apps/web/src/lib/data/juso.ts` (서버 전용 Juso 호출: `https://business.juso.go.kr/addrlink/addrLinkApi.do`, `confmKey=JUSO_API_KEY`, `resultType=json`)
- Create: `apps/web/src/lib/data/region-resolver.ts` (admCd 앞 5자리 → 실패 시 legalCode 앞 5자리 순서로 `sigun-index`/DB 조회 → 대표지 결정)
- Create: `apps/web/src/app/api/v1/regions/search/route.ts`
- Create: `apps/web/src/app/api/v1/regions/resolve/route.ts`
- Test: `apps/web/src/app/api/v1/regions/search/route.test.ts`, `.../resolve/route.test.ts`

**Interfaces:**
- Consumes: Task 1 계약 타입, Task 3 `pickRepresentativeReservoir`, Task 4 스냅샷(`sigun-index.json`, `reservoirs.json`) + Supabase `reservoirs`.
- Produces: 계약과 일치하는 두 핸들러. resolve 순서: Supabase 조회 → 실패 시 커밋 스냅샷(`stale: true`). 후보 없으면 `prepared: false`(자동 인접 지역 선택 금지). 광역시 구 코드가 논가뭄지도에 없으면 `prepared: false`.

- [ ] **Step 1: 실패하는 라우트 테스트 먼저**

- search: Juso mock 응답(나주 샘플 사용) → `candidates[].admCd="1217010200"`, `legalCode="4617010200"`; **주소 원문이 구조화 로그·Supabase 호출 payload에 등장하지 않음**(spy로 강제); Juso 오류 → `ApiError { retryable: true }` 503.
- resolve: `admCd 12170…` → sigun 인덱스에 없음 → `legalCode 46170` 폴백으로 나주시 매칭; 논산 `44230` → 탑정 `4423010045` 결정적 반환(반복 호출 동일); 후보 없음 → `prepared: false` 200; Supabase mock 실패 → 스냅샷 폴백 + `stale: true`.

Run: `pnpm --filter @mulsigye/web test`

Expected: FAIL → 구현 후 PASS.

- [ ] **Step 2: 전체 검증 후 Commit**

Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build`

```powershell
git add apps/web
git commit -m "feat(web): 주소 검색과 대표 저수지 결정 API"
```

---

### Task 6: `/api/v1/status` — 수위 API 60분 캐시 + 3단 폴백

**Files:**
- Create: `apps/web/src/lib/data/waterlevel-api.ts` (`encodeURIComponent(DATA_GO_KR_API_KEY)`, `fac_code`+`date_s/date_e`(최근 14일, 365일 제한 내), `fetch(url, { next: { revalidate: 3600 } })`)
- Create: `apps/web/src/lib/data/status-service.ts` (폴백 오케스트레이션 + 정상 응답 Supabase upsert `source='waterlevel_api'`)
- Create: `apps/web/src/app/api/v1/status/route.ts`
- Test: `apps/web/src/lib/data/waterlevel-api.test.ts`, `status-service.test.ts`, `route.test.ts`

**Interfaces:**
- Consumes: Task 3 XML 정규화·drought-stage, Task 5 resolver(같은 `sigunCode`로 대표지 재결정 — 파라미터는 `sigunCode` 하나), Supabase `reservoir_observations`·`regional_drought_daily`, 커밋 스냅샷.
- Produces: `StatusResponse`. 폴백: ① KRC API 최신 관측 → ② Supabase `reservoir_observations` 최신(`stale: true`) → ③ 커밋 스냅샷(`stale: true`, sources에 스냅샷 기준일 명시). 지역 단계는 `regional_drought_daily` 최신 행(그 실패 시 스냅샷). 게이지용 `rate`(원저수율)와 `avgRatio`(평년 대비)의 의미를 절대 섞지 않는다.

- [ ] **Step 1: 실패하는 테스트 먼저**

- XML 성공 경로: 샘플 XML mock → 최신 관측 선택, fetch 옵션에 `next.revalidate === 3600` 단언, serviceKey가 URL에서 인코딩됨 + 로그에 키 미노출.
- API 장애(HTTP 500·`returnReasonCode!=="00"`·timeout) → Supabase 최신 관측으로 `stale: true`.
- Supabase도 장애 → 스냅샷 폴백 `stale: true` HTTP 200 유지.
- 셋 다 없음 → `ApiError` 503 `retryable: true`.
- 정상 응답 시 upsert가 호출되고 실패해도 응답은 200(fire-and-forget).
- 단계 경계: avgRatio 70.0→정상(70 초과=정상이므로 70.0은 관심), 69.9→관심 등 4경계 전부 — docs/data-sources.md 표(70% 초과=정상) 기준으로 확정.

Run: `pnpm --filter @mulsigye/web test`

Expected: FAIL → 구현 후 PASS.

- [ ] **Step 2: 전체 검증 후 Commit**

Run: `pnpm --filter @mulsigye/web lint && pnpm --filter @mulsigye/web typecheck && pnpm --filter @mulsigye/web test && pnpm --filter @mulsigye/web build`

```powershell
git add apps/web
git commit -m "feat(web): 수위 API 60분 캐시와 3단 폴백 status API"
```

---

### Task 7: 완료 게이트 검증·원격 반영·문서 동기화·PR

**Files:**
- Create: `apps/web/test/stage2-gate.test.ts` (대표 3개 시군 결정성 게이트)
- Modify: `docs/data-sources.md` (실측 필드명 표·조인 규칙·격리 사유·스냅샷 범위·예경보 코드표 반영)
- Modify: `docs/architecture.md` (scripts/ ↔ apps/web/scripts 위임 구조, status 폴백 순서)
- Modify: `docs/testing-and-feedback.md` (`pnpm build:data` → `동작`, 게이트 테스트 명령 추가)
- Modify: `docs/work-plan.md` (단계 2 게이트 통과 근거 기록)

**Interfaces:**
- Consumes: Task 1~6 전부.
- Produces: 게이트 증거 + CI 녹색 PR.

- [ ] **Step 1: 게이트 테스트 먼저 (대표 3개 시군 — 사용자 확정값 사용)**

각 시군에 대해 resolve를 10회 반복 호출해 동일 `facCode` 단언 + 스냅샷 폴백 모드에서도 동일 결과 단언 + status 3단 폴백이 세 시군 모두 HTTP 200 유지.

Run: `pnpm --filter @mulsigye/web test`

Expected: PASS.

- [ ] **Step 2: 원격 스키마 반영·적재**

```powershell
# infra를 cwd로 (CLI workdir 경로 해석 문제 — link는 완료 상태)
cd infra; pnpm exec supabase db push; cd ..
pnpm build:data          # 원격 upsert 포함 전체 적재, 리포트 재생성
```

Expected: 4개 테이블 생성·행 수가 `data/load-report.json`과 일치.

- [ ] **Step 3: 전체 루트 검증**

Run: `pnpm harness:check && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:lint`

Expected: 모두 PASS. (Supabase는 PR CI `supabase` job 녹색으로 확인)

- [ ] **Step 4: Commit, push, PR**

```powershell
git add apps/web docs data/load-report.json
git commit -m "feat: 단계 2 완료 게이트 검증과 문서 동기화"
git push -u origin feat/stage2-data-pipeline
gh pr create --base main --title "feat: KRC 데이터 파이프라인·Supabase (단계 2)" --body "..."
```

PR 본문에 conventions.md 체크리스트 + 남은 열린 질문 명시.

---

## 확정된 결정 (2026-07-21 사용자 승인)

1. **대표 3개 시군**: 논산시 `44230`(탑정 `4423010045`)·나주시 `46170`·기장군 `26710` — 확정.
2. 가뭄예경보 0~4 코드: 포털 컬럼 설명 공식 확인 "0(정상), 1(관심), 2(주의), 3(경계), 4(심각)".
3. 광역시 구 단위 주소(예: 대구 수성구): **"준비 중" 처리 확정** (시도 코드 폴백 안 함).
4. 커밋 스냅샷 범위: 전 시군 최근 60일 + 시설별 최신 1건 + 대표 3개 시군 30일 — 확정.
5. Juso 신 행정코드(`12170…`) ↔ KRC 구코드: bdMgtSn 폴백 채택, 실키로 추가 시군 재검증은 Task 5 구현 중 수행.
