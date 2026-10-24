import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// 읽지 않은 커뮤니티 알림 수. cache(): 한 번의 요청 안에서 메뉴가 여러 번 불러도 조회는 한 번만 한다.
// RLS가 내 알림만 돌려주므로 사용자 id를 따로 넘기지 않는다.
export const getUnreadCount = cache(async () => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
});

// 메뉴의 "커뮤니티" 옆에 붙는 새 알림 수 배지 (Suspense 안에서 쓴다)
// 지금 보는 메뉴(연두 알약) 위에서도 보이도록 주색(라이트=검정, 다크=연두)을 쓴다.
export async function CommunityBadge({ className }: { className?: string }) {
  const count = await getUnreadCount();
  if (!count) return null;

  return (
    <span
      role="status"
      aria-label={`새 알림 ${count}개`}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] leading-none font-semibold text-primary-foreground tabular-nums",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
