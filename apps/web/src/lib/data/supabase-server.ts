// Supabase service-role 클라이언트 팩토리(서버 전용).
// packages/llm은 "server-only" 패키지로 가드하지만, 이 모듈은 Next 런타임 없이
// Node CLI(scripts/build-data.ts)에서도 임포트해야 한다. "server-only"는 react-server
// export 조건이 없는 일반 Node에서 임포트 즉시 throw하므로, 여기서는 임포트 가드 대신
// 호출 시 브라우저 런타임 가드로 대체한다(클라이언트 번들 유입 방지).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ServiceRoleEnv = {
  SUPABASE_URL?: string | undefined;
  SUPABASE_SECRET_KEY?: string | undefined;
};

export function createServiceRoleClient(
  env: ServiceRoleEnv = {
    SUPABASE_URL: process.env["SUPABASE_URL"],
    SUPABASE_SECRET_KEY: process.env["SUPABASE_SECRET_KEY"],
  },
): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "service-role 클라이언트는 서버 전용입니다 — 브라우저에서 만들 수 없습니다",
    );
  }
  const url = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "SUPABASE_URL과 SUPABASE_SECRET_KEY 환경 변수가 필요합니다",
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
