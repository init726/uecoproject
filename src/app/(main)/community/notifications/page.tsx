import { Bell, CheckCheck, CircleCheck, EyeOff, MessageSquare, Reply, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { COMMUNITY_PAGE_SIZE } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead } from "../actions";
import { Pager } from "../pager";
import { CommunityHeader, EmptyState } from "../ui";

type Notification = {
  id: string;
  kind: "comment" | "hidden" | "restored" | "deleted" | "accepted" | "reply";
  target_type: "post" | "comment";
  actor_name: string | null;
  excerpt: string | null;
  created_at: string;
  read_at: string | null;
};

const ICON = {
  comment: MessageSquare,
  hidden: EyeOff,
  restored: RotateCcw,
  deleted: Trash2,
  accepted: CircleCheck,
  reply: Reply,
} as const;

function message(n: Notification) {
  const what = n.target_type === "comment" ? "댓글" : "글";
  const text = n.excerpt ? `'${n.excerpt}'` : "";
  switch (n.kind) {
    case "comment":
      return `${n.actor_name ?? "누군가"}님이 ${text} 글에 댓글을 남겼습니다.`;
    case "hidden":
      return `${text} ${what}이 숨겨져 관리자가 검토 중입니다. 다른 사용자에게는 보이지 않습니다.`;
    case "restored":
      return `${text} ${what}의 검토가 끝나 다시 게시되었습니다.`;
    case "deleted":
      return `${text} ${what}이 관리자에 의해 삭제되었습니다.`;
    case "reply":
      return `내가 댓글을 단 ${text} 글에 ${n.actor_name ?? "누군가"}님이 새 댓글을 남겼습니다.`;
    case "accepted":
      return `${n.actor_name ?? "질문자"}님이 ${text} 질문에서 내 댓글을 채택했습니다.`;
  }
}

export default async function NotificationsPage(props: PageProps<"/community/notifications">) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number.parseInt(String(searchParams.page ?? "1"), 10) || 1);
  const from = (page - 1) * COMMUNITY_PAGE_SIZE;

  await getProfile();
  const supabase = await createClient();

  // RLS: 내 알림만 보인다.
  const [{ data, count }, { count: unread }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, target_type, actor_name, excerpt, created_at, read_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + COMMUNITY_PAGE_SIZE - 1)
      .overrideTypes<Notification[], { merge: false }>(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);

  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / COMMUNITY_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <CommunityHeader
        title="알림"
        description="내 글에 달린 댓글과, 숨김·복구·삭제 소식을 모아 봅니다."
        actions={
          <>
            {!!unread && (
              <form action={markAllNotificationsRead}>
                <SubmitButton variant="outline" size="sm">
                  <CheckCheck aria-hidden="true" />
                  모두 읽음
                </SubmitButton>
              </form>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/community">커뮤니티로</Link>
            </Button>
          </>
        }
      />

      <section className="school-panel">
        <div className="school-panel-heading">
          <h3 className="school-panel-title">
            <Bell className="size-[18px] text-primary" aria-hidden="true" />
            받은 알림
            <span className="text-sm font-normal text-muted-foreground">{count ?? 0}</span>
          </h3>
          {!!unread && <span className="text-xs font-semibold text-primary">안 읽은 알림 {unread}개</span>}
        </div>

        {rows.length === 0 ? (
          <EmptyState title="받은 알림이 없습니다." detail="내 글에 댓글이 달리면 이곳에 알려 드립니다." />
        ) : (
          <div className="divide-y">
            {rows.map((n) => {
              const Icon = ICON[n.kind];
              return (
                <Link
                  key={n.id}
                  href={`/community/notifications/${n.id}`}
                  className={cn(
                    "group flex min-w-0 items-start gap-3 p-4 transition-colors hover:bg-accent/40 sm:px-5",
                    !n.read_at && "bg-accent/40",
                  )}
                >
                  <span
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"
                    aria-hidden="true"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm wrap-break-word group-hover:text-primary", !n.read_at && "font-semibold")}>
                      {message(n)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.read_at && (
                    <>
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <span className="sr-only">읽지 않음</span>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <Pager page={page} totalPages={totalPages} href={(p) => `/community/notifications${p > 1 ? `?page=${p}` : ""}`} />
    </div>
  );
}
