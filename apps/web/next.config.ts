import type { NextConfig } from "next";

/**
 * 보안 헤더. Vercel이 기본으로 붙여 주는 것은 HSTS뿐이라 나머지는 여기서 명시한다.
 *
 * 이 서비스는 로그인·개인정보 입력이 없지만, 주소 검색 결과가 화면에 그려지고
 * 공공 API 응답을 렌더링한다. 주입이 성립할 여지를 미리 좁혀 둔다.
 */
const CONTENT_SECURITY_POLICY = [
  // 기본은 자기 출처만. 이 앱은 외부 스크립트·폰트·이미지를 쓰지 않는다
  // (Pretendard는 next/font/local로 번들에 들어간다).
  "default-src 'self'",
  // Next App Router는 하이드레이션 데이터를 인라인 <script>로 심는다. nonce를 쓰려면
  // 미들웨어가 모든 문서 요청을 가로채 동적 렌더링을 강제해야 하는데, 정적 페이지가
  // 대부분인 이 앱에서는 비용이 이득보다 크다. 대신 외부 출처는 전부 막는다.
  "script-src 'self' 'unsafe-inline'",
  // CSS Modules와 인라인 style 속성(차트 좌표)이 필요하다.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // 브라우저는 같은 출처의 /api/v1/*만 부른다. 외부 전송 경로를 남기지 않는다.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // 클릭재킹 차단. X-Frame-Options의 현대적 대체이며 둘 다 둔다(구형 브라우저 대비).
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * 쓰지 않는 기기 권한은 전부 끈다. 위치가 특히 중요하다 — 이 앱은 GPS를 쓰지 않고
 * 주소로만 지역을 정하는데, 헤더로 막아 두면 그 약속을 기술적으로도 못 박는다.
 */
const PERMISSIONS_POLICY = [
  "geolocation=()",
  "camera=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 외부로 나가는 링크에 우리 경로(질의문자열 포함)를 흘리지 않는다.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mulsigye/contracts", "@mulsigye/llm"],
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: SECURITY_HEADERS }]);
  },
};

export default nextConfig;
export { CONTENT_SECURITY_POLICY, PERMISSIONS_POLICY, SECURITY_HEADERS };
