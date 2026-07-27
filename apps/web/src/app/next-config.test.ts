import { describe, expect, it } from "vitest";

import {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  SECURITY_HEADERS,
} from "../../next.config.ts";

/** 헤더 이름 → 값. 목록이 재정렬돼도 테스트가 깨지지 않게 한다. */
const byKey = new Map(
  SECURITY_HEADERS.map((header) => [header.key, header.value]),
);

describe("보안 헤더", () => {
  it("문서가 요구하는 헤더를 모두 붙인다", () => {
    expect([...byKey.keys()].sort()).toEqual([
      "Content-Security-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]);
  });

  it("MIME 스니핑과 프레임 삽입을 막는다", () => {
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
  });

  it("외부 출처로 나가거나 받아오는 길을 열어 두지 않는다", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    // 외부 호스트를 허용하는 순간 이 앱의 "우리 서버로만 나간다"는 설명이 깨진다.
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:\/\//);
  });

  it("쓰지 않는 기기 권한, 특히 위치를 막는다", () => {
    expect(PERMISSIONS_POLICY).toContain("geolocation=()");
    expect(PERMISSIONS_POLICY).toContain("camera=()");
    expect(PERMISSIONS_POLICY).toContain("microphone=()");
  });

  it("경로 정보가 외부 사이트로 새지 않게 한다", () => {
    expect(byKey.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });
});
