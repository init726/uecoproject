import "server-only";
import { createClient } from "@supabase/supabase-js";

// 관리자 전용 Supabase 클라이언트. secret key는 모든 보안 규칙(RLS)을 무시하므로
// 1) 절대 브라우저 코드에서 import 하지 않는다 (server-only가 막아준다)
// 2) 이 클라이언트를 쓰는 함수는 반드시 먼저 requireAdmin()으로 관리자인지 확인한다.
export function hasAdminKey() {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY가 .env.local에 없어요.");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
