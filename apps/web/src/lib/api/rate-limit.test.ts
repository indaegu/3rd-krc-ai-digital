import { describe, expect, it } from "vitest";

import { clientKey, createRateLimiter } from "./rate-limit.ts";

function requestFrom(ip: string | null): Request {
  const headers = new Headers();
  if (ip !== null) headers.set("x-forwarded-for", ip);
  return new Request("http://localhost/api/v1/regions/search", { headers });
}

describe("clientKey", () => {
  it("같은 IP는 같은 키, 다른 IP는 다른 키다", () => {
    expect(clientKey(requestFrom("1.2.3.4"))).toBe(
      clientKey(requestFrom("1.2.3.4")),
    );
    expect(clientKey(requestFrom("1.2.3.4"))).not.toBe(
      clientKey(requestFrom("1.2.3.5")),
    );
  });

  // 프록시 체인의 첫 항목이 실제 클라이언트다. 뒤쪽을 쓰면 모두가 한 통에 들어간다.
  it("x-forwarded-for의 첫 항목만 본다", () => {
    expect(clientKey(requestFrom("1.2.3.4, 10.0.0.1"))).toBe(
      clientKey(requestFrom("1.2.3.4")),
    );
  });

  it("키에 IP 원문이 남지 않는다", () => {
    expect(clientKey(requestFrom("1.2.3.4"))).not.toContain("1.2.3.4");
  });

  it("헤더가 없으면 하나의 통으로 묶는다", () => {
    expect(clientKey(requestFrom(null))).toBe(clientKey(requestFrom("")));
  });
});

describe("createRateLimiter", () => {
  it("상한까지는 통과시키고 그 다음을 막는다", () => {
    const now = 0;
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    const blocked = limiter.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("다른 키는 서로 영향을 주지 않는다", () => {
    const now = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("창이 바뀌면 다시 열린다", () => {
    let now = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    now = 60_000;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("남은 시간에 맞춰 Retry-After를 준다", () => {
    const now = 30_000;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => now,
    });

    limiter.check("a");
    expect(limiter.check("a").retryAfterSeconds).toBe(30);
  });

  // 무작위 IP를 쏟아부어 메모리를 불리는 것을 막는다.
  it("추적 키가 상한을 넘으면 비운다", () => {
    const now = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxKeys: 3,
      now: () => now,
    });

    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    for (const key of ["b", "c", "d", "e"]) limiter.check(key);

    // 비워졌으므로 a도 다시 통과한다. 정확도보다 메모리 상한을 우선한다.
    expect(limiter.check("a").allowed).toBe(true);
  });
});
