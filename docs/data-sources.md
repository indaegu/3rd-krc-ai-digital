# data-sources.md — 공공데이터 명세

> 데이터 페치·가공 전에 읽는다. 모든 핵심 원천은 공공데이터포털의 한국농어촌공사
> 개방 데이터다. **KRC 공공데이터 사용은 공모전 필수 요건**이다.

## 사용 데이터 5종

### 1) 농촌용수 저수지 수위정보 조회(API) — 현재 대표 저수지

- 공식 페이지: [공공데이터포털 OpenAPI](https://www.data.go.kr/data/15099919/openapi.do)
- 형태: 공공데이터포털 OpenAPI, 응답 **XML**, 활용신청·서비스 키 필요.
- 엔드포인트: `http://apis.data.go.kr/B552149/reserviorWaterLevel/reservoirlevel/`
  — 원본의 오타 경로(`reservior`) 그대로가 실제 엔드포인트다. 고치지 않는다.
- 파라미터: `serviceKey`/`fac_code`/`date_s`/`date_e`/`pageNo`/`numOfRows`.
  `check_date`는 하이픈 없는 `YYYYMMDD`(실측)라 KST 달력일 `YYYY-MM-DD`로 변환한다.
- 역할: 대표 저수지의 날짜별 수위·원저수율 `rate` → 메인 게이지와 현재값.
- 식별: 시설코드 `fac_code`를 기본 키로 사용한다. 이름 문자열을 PK로 쓰지 않는다.
- 조회 제약: 시설코드 조회는 최대 365일, 지역(`county`) 조회는 최대 31일이다.
- 운영: Route Handler가 호출하고 60분 캐시한다. 마지막 정상 응답을 Supabase에 저장한다.
- 인증: `DATA_GO_KR_API_KEY`. **디코딩 키이므로 호출 시 `encodeURIComponent`가 필수다.**
  클라이언트·로그·저장소에 노출하지 않는다.

### 2) 전국 저수지 일별 저수율(파일데이터) — 저수지별 과거 참고

- 공식 페이지: [공공데이터포털 파일데이터](https://www.data.go.kr/data/15113475/fileData.do)
- 형태: 연간 CSV(**UTF-8 BOM** — 4종 중 유일하게 CP949가 아님). 실측 헤더는
  `저수지명,위치,유효저수량,2025-01-01,…`으로 저수지 한 행에 일자별 저수율 365열이
  이어지는 wide 형식이다(3,463행).
- 역할: 대표 저수지 원저수율의 과거 확인, API 장애 시 제출 시점 참고 스냅샷.
- 처리: 일자 열을 `fac_code + observed_on + rate`의 long 형식으로 정규화한다.
- 조인: **`fac_code` 열이 없다.** `(저수지명, 위치)` ↔ 시설제원 `(시설명, 소재지)` 정확 일치
  조인으로만 `fac_code`를 얻는다(실측 3,376/3,459 매칭 97.6%). 미매칭은 `no_spec_match`,
  동명·동위치 중복쌍(실측 4쌍)은 `ambiguous_join`으로 격리한다.
- 주의: 시군 통합 평년 대비 값이 아니므로 공식 단계·주 예측 목표로 사용하지 않는다.

### 3) 논가뭄지도(파일데이터) — 공식 단계·예측의 주계열 ⭐

- 공식 페이지: [공공데이터포털 파일데이터](https://www.data.go.kr/data/15117185/fileData.do)
- 형태: 연간 CSV(CP949). 실측 헤더는
  `기준일자,시도명,시군명,시군코드,저수율(퍼센트),평년(퍼센트),평년대비(퍼센트),가뭄단계`
  — 167개 시군 × 365일 = 60,955행, 가뭄단계는 한국어 문자열이다.
- 역할: 화면의 공식 단계와 14일 추세 예측·백테스트의 **유일한 주계열**.
- 내부 필드: `sigunCode`, `observedOn`, `regionalRate`, `normalRate`, `avgRatio`, `officialStage`.
- `avgRatio`는 비율(%)이고 일일 변화량은 퍼센트포인트(%p)다. 원저수율 `rate`와 섞지 않는다.
- 주의: 서울(11000)·부산(26000) 등 비농업 행정구는 `저수율=0, 평년=0, 평년대비=100`
  플레이스홀더 행이다(실측 4,697행) — `placeholder_region`으로 격리한다.

### 4) 가뭄예경보자료(파일데이터) — 공식 전망

- 공식 페이지: [공공데이터포털 파일데이터](https://www.data.go.kr/data/15117163/fileData.do)
- 형태: 연간 CSV(CP949). 실측 헤더는
  `기준일자,시도명,시군명,행정구역코드,가뭄현황,가뭄전망1,가뭄전망2,가뭄전망3`
  — 월 1회 × 12회분, 행정구역코드는 논가뭄지도 시군코드와 100% 일치한다.
- 역할: 자체 14일 예측 옆에 공식 전망을 병기한다. 자체 예측만 단독 노출하지 않는다.
- 화면·API에는 발행일과 원천명을 함께 표시한다.
- 전망 값은 0~4 숫자 코드다(포털 컬럼 설명으로 공식 확인). 라벨 변환은
  `drought-stage.ts` 한 곳에서만 한다. 0~4 범위 밖은 `outlook_out_of_range`로 격리한다.

| 코드 | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| 의미 | 정상 | 관심 | 주의 | 경계 | 심각 |

### 5) 농업기반시설 시설제원_저수지(파일데이터) — 대표 저수지 결정

- 공식 페이지: [공공데이터포털 파일데이터](https://www.data.go.kr/data/15044339/fileData.do)
- 형태: 연간 CSV(CP949). 실측 헤더는 `표준코드,본부,지사,시설명,소재지,…,수혜면적,…`
  26열 — 3,422행, `표준코드` 중복 0.
- 역할: 주소의 시군구와 저수지를 연결하고 **우리 지역 대표 저수지**를 결정한다.
- 내부 필드: `facCode`, `name`, `address`, `sigunCode`, `beneficiaryArea`.
- **시군코드 열이 없다.** `표준코드` 앞 5자리가 시군코드다(탑정 `4423010045` → `44230` 논산,
  실측). Supabase `reservoirs.sigun_code`는 `left(fac_code, 5)` generated column으로 유도한다.
  156개 prefix 중 42개는 광역시 구 단위 코드로 논가뭄지도에 없다 — sigun_code FK를 만들지 않는다.
- 수혜면적은 숫자로 정규화하고 단위는 원천 메타데이터와 적재 리포트에 기록한다.

## 원천 실측 필드(한국어 헤더) → 내부 필드

| 원천 | 실측 필드명(한국어 헤더) | 내부 필드 |
|---|---|---|
| 논가뭄지도 | `기준일자` / `시도명` / `시군명` / `시군코드` / `저수율(퍼센트)` / `평년(퍼센트)` / `평년대비(퍼센트)` / `가뭄단계` | `observedOn` / `sidoName` / `sigunName` / `sigunCode` / `regionalRate` / `normalRate` / `avgRatio` / `officialStage` |
| 시설제원_저수지 | `표준코드` / `시설명` / `소재지` / `수혜면적` (26열 중 사용분) | `facCode` / `name` / `address` / `beneficiaryArea` (+`sigunCode` = `facCode` 앞 5자리 유도) |
| 일별 저수율 | `저수지명` / `위치` / `유효저수량` / 날짜 열(`2025-01-01`…) | (이름·위치 조인으로 `facCode`) / `observedOn` / `rate` |
| 가뭄예경보 | `기준일자` / `시도명` / `시군명` / `행정구역코드` / `가뭄현황` / `가뭄전망1/2/3` | `publishedOn` / `sidoName` / `sigunName` / `sigunCode` / `currentLevel` / `outlook1m/2m/3m` |
| 수위 API(XML) | `check_date` / `county` / `fac_code` / `fac_name` / `rate` / `water_level` | `observedOn`(KST 변환) / (trim 후 참고용, 저장 안 함) / `facCode` / `facName` / `rate` / `waterLevel` |

## 공식 가뭄 단계

| 단계 | 평년 대비 저수율 `avgRatio` | UI 토큰 |
|---|---:|---|
| 정상 | 70% 초과 | `ok` |
| 관심 | 60% 초과 70% 이하 | `watch` |
| 주의 | 50% 초과 60% 이하 | `care` |
| 경계 | 40% 초과 50% 이하 | `alert` |
| 심각 | 40% 이하 | `crit` |

- 임계값은 `apps/web/src/lib/data/drought-stage.ts` 한 곳에만 둔다.
- 원천이 제공하는 `officialStage`를 우선 표시한다. 계산값은 검증·결측 폴백용이며 다르면
  원천 행을 격리하고 적재 리포트에 남긴다.
- 게이지의 물 높이는 대표 저수지 `rate`, 단계는 지역 `avgRatio` 기준이다.

## 주소 → 우리 지역 대표 저수지

GPS 거리나 “가장 가까운 저수지”를 계산하지 않는다.

1. 도로명주소 API에서 사용자가 선택한 주소의 행정 시군구 코드를 얻는다.
2. 주소 원문은 대표지 결정 후 폐기하며 로그·Supabase·분석 도구에 저장하지 않는다.
3. 시설제원에서 같은 시군구 코드의 저수지만 후보로 둔다.
4. `beneficiaryArea`가 가장 큰 시설을 대표 저수지로 선택한다.
5. 수혜면적이 같으면 `facCode` 문자열 오름차순의 첫 시설을 선택한다.
6. 후보가 없으면 자동으로 인접 지역을 고르지 않고 “이 지역은 준비 중이에요”를 반환한다.

API와 UI의 명칭은 항상 **“우리 지역 대표 저수지”**다. 거리 필드는 계약에 넣지 않는다.

## 정규화·품질 규칙

- 외부 필드명은 `apps/web/src/lib/data`에서 내부 camelCase DTO로 변환한 뒤에만 사용한다.
- 날짜는 KST 달력일 `YYYY-MM-DD`, API 기준 시각은 ISO 8601 offset 포함 문자열로 둔다.
- 빈 문자열·`-`·비숫자는 `null`로 정규화한다. 음수 저수율은 결측으로 격리한다.
- `rate`와 `avgRatio`는 100을 넘을 수 있으므로 무조건 잘라내지 않는다. 원천별 관측 범위와
  급격한 변화는 경고로 기록하고 실제 표본 확인 후 격리한다.
- 3일 이하 연속 결측만 선형 보간할 수 있다. 더 긴 결측은 예측에서 제외하고 신뢰도 하향을 표시한다.
- 적재 결과에는 원천 파일명·공공데이터 갱신일·행 수·격리 행 수·체크섬을 남긴다.
- 격리 사유 코드는 `apps/web/src/lib/data/quarantine.ts`에 고정된 8종만 사용한다.

| 격리 사유 | 의미 |
|---|---|
| `placeholder_region` | 논가뭄지도의 비농업 행정구 `0/0/100` 플레이스홀더 행 |
| `stage_mismatch` | 원천 `가뭄단계`가 `avgRatio` 기준 계산 단계와 다름 |
| `negative_rate` | 음수 저수율 |
| `no_spec_match` | 일별 저수율 `(저수지명, 위치)`가 시설제원과 매칭되지 않음 |
| `ambiguous_join` | 일별 저수율 조인 키가 시설제원에서 중복(동명·동위치) |
| `outlook_out_of_range` | 가뭄예경보 값이 0~4 범위 밖 |
| `invalid_value` | 필수 값이 숫자·형식 규칙에 어긋남 |
| `invalid_row` | 열 수 부족 등 행 자체가 깨짐 |

## 갱신·스냅샷 정책

- 4개 파일데이터는 연간 갱신이다. 프로젝트 시작과 제출 직전에 포털 갱신일을 확인해 수동 적재한다.
- 원천 갱신일이 같으면 일일 재적재·cron을 만들지 않는다.
- 수위 API만 요청 시 조회하며 60분 캐시한다.
- 정규화 결과는 Supabase에 upsert하고 제출 시점의 검증된 `data/*.json`과 적재 리포트를 커밋한다.
- 커밋 스냅샷(`data/snapshots/`) 범위는 다음과 같이 고정한다(2026-07-21 확정).
  - `sigun-index.json`: 논가뭄지도 기준 시군코드 → 시도·시군명 전체 인덱스.
  - `reservoirs.json`: 시설제원 전량(3,422행).
  - `regional-drought-daily.json`: 전 시군 최근 60일.
  - `official-outlooks.json`: 12회분 전체.
  - `reservoir-observations.json`: 시설별 최신 1건 + 대표 3개 시군 대표지 최근 30일.
- Supabase는 캐시·배포 저장소이지 원천이 아니다. 출처·필드 의미의 SSOT는 이 문서다.

## 변경 시 동기화

데이터셋, 필드, 단위, 호출 제약, 대표지 규칙이 바뀌면 같은 변경에서
`packages/contracts/openapi.yaml`, 정규화 테스트, [prediction-model.md](prediction-model.md),
[product.md](product.md)를 함께 갱신한다.
