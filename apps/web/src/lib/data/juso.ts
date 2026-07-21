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
    common: z.object({ errorCode: z.string() }),
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

export type JusoSearchResult =
  { ok: true; candidates: JusoCandidate[] } | { ok: false };

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
    return { ok: false };
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
      return { ok: false };
    }
    const parsed = jusoResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false };
    }
    const { common, juso } = parsed.data.results;
    if (common.errorCode !== "0") {
      return { ok: false };
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
    return { ok: false };
  }
}
