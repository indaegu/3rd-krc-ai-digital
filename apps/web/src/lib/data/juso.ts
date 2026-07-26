// 도로명주소(Juso) 검색 호출 — 서버 전용.
// 검색어와 응답 주소 원문(roadAddr 등)은 응답으로만 흘려보내고
// 어떤 로그·저장소에도 남기지 않는다(플랜 Global Constraints). 이 모듈은 로그를 찍지 않는다.
import { z } from "zod";

export const JUSO_ENDPOINT =
  "https://business.juso.go.kr/addrlink/addrLinkApi.do";

const DEFAULT_TIMEOUT_MS = 5_000;
const COUNT_PER_PAGE = 10;
const CODE_PATTERN = /^[0-9]{10}$/;

const jusoResponseSchema = z.object({
  results: z.object({
    common: z.object({
      errorCode: z.string(),
      // 공식 오류표(business.juso.go.kr)의 오류메시지 원문. 코드 번호는 문서에 공표되지 않아
      // **메시지 문구로 분류**한다 — 표의 좌측 열이 곧 이 값이다.
      errorMessage: z.string().nullish(),
    }),
    juso: z
      .array(
        z.object({
          roadAddr: z.string(),
          admCd: z.string(),
          bdMgtSn: z.string(),
        }),
      )
      .nullish(),
  }),
});

export type JusoCandidate = {
  /** 표시용 도로명주소 — 선택 후 폐기, 서버 저장 금지. */
  label: string;
  /** 행정구역코드 10자리(신 체계일 수 있어 KRC 시군코드와 불일치 가능). */
  admCd: string;
  /** bdMgtSn 앞 10자리 법정동코드 — admCd 불일치 대비 폴백. */
  legalCode: string;
};

/**
 * 검색 실패 사유 — 도로명주소 공식 오류표를 사용자에게 설명 가능한 단위로 묶은 것이다.
 * 종전에는 모든 실패가 "잠시 어려워요"로 뭉개져, "인천"처럼 시·도만 넣은 경우에도
 * 재시도하라는 엉뚱한 안내가 나갔다.
 *
 * | 사유 | 공식 오류메시지 |
 * |---|---|
 * | `too_broad` | 주소를 상세히 입력해 주시기 바랍니다.(시도명 검색 불가) |
 * | `too_many` | 검색 범위를 초과하였습니다.(9천건 초과) |
 * | `too_short` | 검색어는 두글자 이상 입력되어야 합니다. |
 * | `digits_only` | 검색어는 문자와 숫자 같이 입력되어야 합니다. |
 * | `long_number` | 검색어에 너무 긴 숫자가 포함되어 있습니다. |
 * | `too_long` | 검색어가 너무 깁니다. |
 * | `forbidden_chars` | 특수문자+숫자만 / SQL 예약어·특수문자 |
 * | `empty` | 검색어가 입력되지 않았습니다. |
 * | `auth` | 승인되지 않은 KEY / 개발승인키 만료 / 정상적인 경로 |
 * | `system` | 시스템에러 |
 * | `unknown` | 표에 없는 응답·HTTP·timeout·형식 오류 |
 */
export type JusoFailureReason =
  | "too_broad"
  | "too_many"
  | "too_short"
  | "digits_only"
  | "long_number"
  | "too_long"
  | "forbidden_chars"
  | "empty"
  | "auth"
  | "system"
  | "unknown";

export type JusoSearchResult =
  | { ok: true; candidates: JusoCandidate[] }
  | { ok: false; reason: JusoFailureReason };

/**
 * 공식 오류메시지 → 사유 분류. 부분 문자열로 맞춰 문구가 조금 달라도 견딘다.
 * 순서가 중요하다 — 더 구체적인 규칙을 앞에 둔다("긴 숫자"가 "너무 깁니다"보다 앞).
 */
export function classifyJusoError(errorMessage: string): JusoFailureReason {
  const text = errorMessage.trim();
  if (text.includes("상세히")) return "too_broad";
  if (text.includes("검색 범위")) return "too_many";
  if (text.includes("두글자") || text.includes("두 글자")) return "too_short";
  if (text.includes("긴 숫자")) return "long_number";
  if (text.includes("문자와 숫자")) return "digits_only";
  if (text.includes("너무 깁니다")) return "too_long";
  if (text.includes("특수문자") || text.includes("예약어")) {
    return "forbidden_chars";
  }
  if (text.includes("입력되지 않았")) return "empty";
  if (
    text.includes("승인") ||
    text.includes("KEY") ||
    text.includes("정상적인 경로")
  ) {
    return "auth";
  }
  if (text.includes("시스템")) return "system";
  return "unknown";
}

export type JusoDeps = {
  fetchImpl?: typeof fetch;
  apiKey?: string | undefined;
  timeoutMs?: number;
};

/** Juso 주소 검색. 실패(HTTP·errorCode·timeout·형식 오류)는 전부 { ok: false }로 수렴한다. */
export async function searchJusoAddresses(
  keyword: string,
  deps: JusoDeps = {},
): Promise<JusoSearchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? process.env["JUSO_API_KEY"];
  if (apiKey === undefined || apiKey === "") {
    return { ok: false, reason: "auth" };
  }

  const params = new URLSearchParams({
    confmKey: apiKey,
    currentPage: "1",
    countPerPage: String(COUNT_PER_PAGE),
    keyword,
    resultType: "json",
  });

  try {
    const response = await fetchImpl(`${JUSO_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, reason: "unknown" };
    }
    const parsed = jusoResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, reason: "unknown" };
    }
    const { common, juso } = parsed.data.results;
    if (common.errorCode !== "0") {
      // 사유만 넘긴다 — 오류메시지·검색어 원문은 어디에도 남기지 않는다.
      return {
        ok: false,
        reason: classifyJusoError(common.errorMessage ?? ""),
      };
    }

    const candidates: JusoCandidate[] = [];
    for (const entry of juso ?? []) {
      const label = entry.roadAddr.trim();
      const admCd = entry.admCd.trim();
      const legalCode = entry.bdMgtSn.trim().slice(0, 10);
      if (
        label === "" ||
        !CODE_PATTERN.test(admCd) ||
        !CODE_PATTERN.test(legalCode)
      ) {
        continue; // 코드 형식이 깨진 후보는 조용히 제외 — 주소 원문을 로그로 남기지 않는다.
      }
      candidates.push({ label, admCd, legalCode });
    }
    return { ok: true, candidates };
  } catch {
    // 네트워크 오류·timeout — 오류 객체에 검색어가 담긴 URL이 섞일 수 있어 로그를 찍지 않는다.
    return { ok: false, reason: "unknown" };
  }
}
