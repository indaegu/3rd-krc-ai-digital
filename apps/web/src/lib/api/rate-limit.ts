// 공개 API의 속도 제한 — 외부 키를 태우는 경로(주소 검색·코치)를 지킨다.
//
// 이 서비스는 로그인이 없어 누구나 부를 수 있다. 주소 검색은 도로명주소 승인키를,
// 코치는 LLM 예산을 소모하므로 한 사람이 반복 호출하면 다른 사용자가 쓰지 못하게 된다.
//
// 한계를 분명히 해 둔다. Vercel 서버리스는 인스턴스가 여럿이고 오래 살지 않으므로,
// 이 계수는 **인스턴스마다 따로** 센다. 결정적인 전역 제한이 아니라 한 클라이언트의
// 연속 호출을 눌러 주는 완충이다. 전역 제한이 필요하면 공유 저장소(KV·Redis)가 있어야
// 하는데, 지금 그 의존을 들이는 것은 공모전 범위에서 과하다.
//
// 키는 IP를 그대로 두지 않고 프로세스마다 새로 만든 소금을 섞어 해시한 값이다.
// 메모리에만 있고 로그·저장소로 나가지 않으며, 프로세스가 끝나면 함께 사라진다.

/** 프로세스마다 다른 소금. 해시 값만 봐서는 IP로 되돌릴 수 없게 한다. */
const SALT = (() => {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16)).join("");
})();

/** FNV-1a 64비트. 암호용이 아니라 버킷을 가르기 위한 것이다(충돌해도 같은 통을 쓸 뿐). */
function hashKey(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const input = `${SALT}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16);
}

/**
 * 요청자 식별 키. Vercel이 붙이는 x-forwarded-for의 첫 항목을 쓴다.
 *
 * 헤더가 없으면(로컬·직접 호출) 모두 같은 통에 들어간다 — 알 수 없는 상대를 각각
 * 무제한으로 두는 것보다 함께 묶어 두는 편이 안전하다.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  return hashKey(first === "" ? "unknown" : first);
}

export type RateLimitVerdict = {
  allowed: boolean;
  /** 429일 때 Retry-After에 실을 초. 허용된 요청에서는 0이다. */
  retryAfterSeconds: number;
};

export type RateLimiterOptions = {
  /** 창 하나에서 허용하는 요청 수. */
  limit: number;
  /** 창 길이(밀리초). */
  windowMs: number;
  /** 테스트에서 시간을 고정하기 위한 주입점. */
  now?: () => number;
  /**
   * 동시에 추적하는 키 수 상한. 넘으면 통째로 비운다 —
   * 무작위 IP를 쏟아부어 메모리를 불리는 것을 막는다.
   */
  maxKeys?: number;
};

const DEFAULT_MAX_KEYS = 10_000;

export type RateLimiter = {
  check: (key: string) => RateLimitVerdict;
};

/**
 * 고정 창 계수기. 창이 바뀌면 세던 값을 버린다.
 *
 * 슬라이딩 윈도가 더 정확하지만 키마다 타임스탬프 배열을 들고 있어야 한다. 여기서는
 * 창 경계에서 최대 2배까지 통과할 수 있는 정도를 감수하고 메모리를 아낀다 — 목적이
 * 정밀한 과금이 아니라 폭주 차단이기 때문이다.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const counters = new Map<string, { windowStart: number; count: number }>();

  return {
    check(key: string): RateLimitVerdict {
      const current = now();
      const windowStart = current - (current % options.windowMs);

      if (counters.size > maxKeys) {
        counters.clear();
      }

      const entry = counters.get(key);
      if (entry === undefined || entry.windowStart !== windowStart) {
        counters.set(key, { windowStart, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (entry.count >= options.limit) {
        const msLeft = windowStart + options.windowMs - current;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)),
        };
      }

      entry.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
