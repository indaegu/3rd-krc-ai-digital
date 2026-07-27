import { afterEach, describe, expect, it } from "vitest";

import {
  logApiRequest,
  newRequestId,
  outcomeOf,
  setLogSink,
  sourceTag,
} from "./api-log.ts";

afterEach(() => {
  setLogSink(null);
});

function capture(): string[] {
  const lines: string[] = [];
  setLogSink((line) => lines.push(line));
  return lines;
}

describe("sourceTag", () => {
  // KRC API가 살아 있는지 스냅샷으로 버티는지가 한 줄로 보여야 외부 API 실패율을 읽을 수 있다.
  it("원천 이름을 짧은 슬러그로 압축한다", () => {
    expect(sourceTag(["농촌용수 저수지 수위정보 조회", "논가뭄지도"])).toBe(
      "waterlevel_api+drought_map",
    );
  });

  it("날짜가 붙는 커밋 스냅샷도 같은 슬러그로 묶는다", () => {
    expect(sourceTag(["커밋 스냅샷(2025-12-31 기준)"])).toBe(
      "committed_snapshot",
    );
  });

  it("같은 원천이 여러 번 나와도 한 번만 적는다", () => {
    expect(sourceTag(["논가뭄지도", "논가뭄지도"])).toBe("drought_map");
  });

  it("모르는 원천은 이름을 흘리지 않고 other로 적는다", () => {
    expect(sourceTag(["어떤 새 원천"])).toBe("other");
  });

  it("원천이 없으면 필드를 만들지 않는다", () => {
    expect(sourceTag([])).toBeUndefined();
  });
});

describe("outcomeOf", () => {
  it("사용자 입력 오류와 서비스 장애를 나눈다", () => {
    expect(outcomeOf(200)).toBe("ok");
    expect(outcomeOf(404)).toBe("client_error");
    expect(outcomeOf(503)).toBe("unavailable");
  });
});

describe("newRequestId", () => {
  it("요청마다 다른 값을 만든다", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRequestId()));
    expect(ids.size).toBe(50);
  });

  it("16자리 16진수다(사용자 정보가 섞이지 않는다)", () => {
    expect(newRequestId()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("logApiRequest", () => {
  it("정해진 필드만 한 줄 JSON으로 남긴다", () => {
    const lines = capture();

    logApiRequest({
      requestId: "abc123",
      route: "/api/v1/status",
      status: 200,
      outcome: "ok",
      durationMs: 42,
      source: "waterlevel_api",
      stale: false,
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      msg: "api_request",
      requestId: "abc123",
      route: "/api/v1/status",
      status: 200,
      outcome: "ok",
      durationMs: 42,
      source: "waterlevel_api",
      stale: false,
    });
  });

  it("없는 값은 키 자체를 빼서 줄을 짧게 유지한다", () => {
    const lines = capture();

    logApiRequest({
      requestId: "abc123",
      route: "/api/v1/health",
      status: 200,
      outcome: "ok",
      durationMs: 1,
    });

    expect(Object.keys(JSON.parse(lines[0] ?? "") as object).sort()).toEqual([
      "durationMs",
      "msg",
      "outcome",
      "requestId",
      "route",
      "status",
    ]);
  });
});
