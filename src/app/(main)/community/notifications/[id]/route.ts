import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 알림을 누르면: 읽음으로 바꾸고 해당 글로 보낸다.
// 내 알림이 아니거나 없는 알림이면 알림 목록으로 보낸다. (RLS가 내 알림만 조회되게 한다)
export async function GET(request: NextRequest, ctx: RouteContext<"/community/notifications/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data } = await supabase.from("notifications").select("post_id, kind").eq("id", id).maybeSingle();
  if (data) await supabase.rpc("mark_notification_read", { p_id: id });

  // 삭제된 글은 더 열 수 없으므로 목록으로 보낸다.
  const target = data && data.kind !== "deleted" ? `/community/${data.post_id}` : "/community/notifications";
  return NextResponse.redirect(new URL(target, request.url));
}
