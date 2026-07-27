// 공개 API의 구조화 로그 — Vercel 런타임 로그에서 원천·상태·폴백을 볼 수 있게 한다.
//
// 지금까지 로그가 하나도 없었다. 배포된 서비스가 KRC API로 답하고 있는지 스냅샷으로
// 버티고 있는지, 코치가 왜 정적으로 떨어졌는지 확인할 방법이 없었다는 뜻이다.
//
// 대신 로그가 개인정보를 흘리면 안 된다(docs/testing-and-feedback.md 보안·관측성).
// 그래서 자유 문자열을 받지 않고 **정해진 필드만** 받는 타입을 두고, 값도 짧은 슬러그로
// 정규화한다. 검색어·주소·IP·시설코드는 이 모듈을 통해 나갈 방법이 없다.
//
// requestId는 요청마다 새로 만드는 무작위 값이다. 같은 요청의 여러 줄을 잇기 위한 것이며
// 사용자·기기와 이어지지 않는다(저장하지도 않는다).

/** 응답이 어떤 경로로 만들어졌는지. 값은 고정 집합이라 로그에 자유 문자열이 섞이지 않는다. */
export type ApiOutcome = "ok" | "client_error" | "unavailable";

export type ApiLogRecord = {
  /** 요청마다 새로 만든 무작위 식별자. 사용자와 이어지지 않는다. */
  requestId: string;
  /** 고정 경로. 질의문자열은 넣지 않는다(검색어가 섞인다). */
  route: string;
  status: number;
  outcome: ApiOutcome;
  durationMs: number;
  /** 응답이 실제로 쓴 원천의 짧은 슬러그. 예: "waterlevel_api+drought_map" */
  source?: string;
  /** 폴백·오류 사유. 코치 fallbackReason이나 도메인 오류 코드다. */
  fallback?: string;
  /** 공표 지연 여부(응답의 stale 그대로). */
  stale?: boolean;
};

/**
 * 원천 이름 → 짧은 슬러그.
 *
 * 사람이 읽는 한글 원천명을 그대로 로그에 넣으면 줄이 길어지고 집계도 어렵다.
 * 여기 없는 이름(예: "커밋 스냅샷(2025-12-31 기준)")은 날짜가 붙으므로 접두사로 맞춘다.
 */
const SOURCE_SLUGS: ReadonlyArray<readonly [string, string]> = [
  ["농촌용수 저수지 수위정보 조회", "waterlevel_api"],
  ["논가뭄지도", "drought_map"],
  ["가뭄예경보자료", "outlook"],
  ["저수지 실측 기반 지역 추정", "region_estimate"],
  ["Supabase 스냅샷", "supabase"],
  ["농업기반시설 시설제원_저수지", "reservoir_spec"],
  ["커밋 스냅샷", "committed_snapshot"],
  ["도로명주소 API", "juso"],
];

/**
 * 응답의 sources 배열을 로그용 슬러그로 압축한다.
 *
 * KRC API가 살아 있는지(waterlevel_api) 스냅샷으로 버티는지(committed_snapshot)가
 * 한 줄로 보인다 — 외부 API 실패율을 따로 계측하지 않아도 이 값으로 읽을 수 있다.
 */
export function sourceTag(sources: readonly string[]): string | undefined {
  if (sources.length === 0) return undefined;
  const slugs: string[] = [];
  for (const source of sources) {
    const matched = SOURCE_SLUGS.find(([prefix]) => source.startsWith(prefix));
    const slug = matched?.[1] ?? "other";
    if (!slugs.includes(slug)) slugs.push(slug);
  }
  return slugs.join("+");
}

/** HTTP 상태 → 결과 구분. 집계할 때 4xx(사용자 입력)와 5xx(서비스)를 나눠 본다. */
export function outcomeOf(status: number): ApiOutcome {
  if (status < 400) return "ok";
  if (status < 500) return "client_error";
  return "unavailable";
}

/**
 * 요청 식별자. 무작위 16자리 16진수면 한 배포 안에서 충돌하지 않으면서 충분히 짧다.
 *
 * crypto.randomUUID를 쓸 수 없는 런타임(구형 Node 테스트 등)에서도 동작해야 하므로
 * getRandomValues로 직접 만든다.
 */
export function newRequestId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** 로그 한 줄을 실제로 뱉는 함수. 테스트에서 갈아 끼울 수 있게 분리했다. */
export type LogSink = (line: string) => void;

const defaultSink: LogSink = (line) => {
  // Vercel 런타임 로그는 stdout 한 줄을 그대로 수집한다. JSON 한 줄이면 검색·집계가 된다.
  console.log(line);
};

let sink: LogSink = defaultSink;

/** 테스트 전용 — 로그 출력을 가로챈다. */
export function setLogSink(next: LogSink | null): void {
  sink = next ?? defaultSink;
}

/**
 * 구조화 로그 한 줄을 남긴다.
 *
 * undefined 필드는 빼서 줄을 짧게 유지한다. 여기 정의된 키 말고는 나갈 수 없다.
 */
export function logApiRequest(record: ApiLogRecord): void {
  const line: Record<string, string | number | boolean> = {
    msg: "api_request",
    requestId: record.requestId,
    route: record.route,
    status: record.status,
    outcome: record.outcome,
    durationMs: record.durationMs,
  };
  if (record.source !== undefined) line.source = record.source;
  if (record.fallback !== undefined) line.fallback = record.fallback;
  if (record.stale !== undefined) line.stale = record.stale;
  sink(JSON.stringify(line));
}
