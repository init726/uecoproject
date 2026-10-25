import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// 읽지 않은 커뮤니티 알림 수 (커뮤니티 화면의 "알림" 버튼에 쓴다). cache(): 한 요청 안에서는 한 번만 조회한다.
// RLS가 내 알림만 돌려주므로 사용자 id를 따로 넘기지 않는다.
export const getUnreadCount = cache(async () => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
});
