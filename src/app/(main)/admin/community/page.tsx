import { Flag, History } from "lucide-react";
import Link from "next/link";
import { CommunityHeader, EmptyState } from "@/app/(main)/community/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { CONTENT_STATUS_LABEL, ROLE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Comment, ContentStatus, Post, Role } from "@/lib/types";
import { ModerationForm } from "./moderation-form";

type OpenReport = {
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  created_at: string;
  reporter: { name: string } | null;
};
type PostRow = Pick<Post, "id" | "author_name" | "author_role" | "title" | "body" | "status" | "created_at">;
type CommentRow = Pick<Comment, "id" | "post_id" | "author_name" | "author_role" | "body" | "status" | "created_at">;
type LogRow = {
  id: string;
  target_type: "post" | "comment";
  post_id: string | null;
  action: "auto_hide" | "hide" | "restore" | "delete";
  reason: string;
  target_excerpt: string | null;
  created_at: string;
  actor: { name: string } | null;
};

type Item = {
  key: string;
  type: "post" | "comment";
  id: string;
  postId: string; // 상세 보기로 이동할 글
  status: ContentStatus;
  author: string;
  role: Role;
  title?: string;
  body: string;
  createdAt: string;
  reports: OpenReport[];
};

const ACTION_LABEL = { auto_hide: "자동 숨김", hide: "숨김", restore: "복구", delete: "삭제" } as const;

export default async function AdminCommunityPage() {
  await requireAdmin();
  const supabase = await createClient();

  // 처리 전 신고와 '검토 중'인 글·댓글을 모은다. (관리자는 RLS상 숨겨진 글도 볼 수 있다)
  const [{ data: reportRows }, { data: reviewPosts }, { data: reviewComments }, { data: logRows }] =
    await Promise.all([
      supabase
        .from("reports")
        .select("post_id, comment_id, reason, created_at, reporter:profiles!reports_reporter_id_fkey(name)")
        .is("handled_at", null)
        .order("created_at")
        .overrideTypes<OpenReport[], { merge: false }>(),
      supabase
        .from("posts")
        .select("id, author_name, author_role, title, body, status, created_at")
        .eq("status", "review")
        .overrideTypes<PostRow[], { merge: false }>(),
      supabase
        .from("comments")
        .select("id, post_id, author_name, author_role, body, status, created_at")
        .eq("status", "review")
        .overrideTypes<CommentRow[], { merge: false }>(),
      supabase
        .from("moderation_logs")
        .select(
          "id, target_type, post_id, action, reason, target_excerpt, created_at, actor:profiles!moderation_logs_actor_id_fkey(name)",
        )
        .order("created_at", { ascending: false })
        .limit(30)
        .overrideTypes<LogRow[], { merge: false }>(),
    ]);

  const reports = reportRows ?? [];
  const posts = new Map((reviewPosts ?? []).map((p) => [p.id, p]));
  const comments = new Map((reviewComments ?? []).map((c) => [c.id, c]));

  // 아직 게시 중이지만 신고가 쌓이는 중인 대상도 가져온다.
  const extraPostIds = [...new Set(reports.map((r) => r.post_id).filter((id): id is string => !!id && !posts.has(id)))];
  const extraCommentIds = [
    ...new Set(reports.map((r) => r.comment_id).filter((id): id is string => !!id && !comments.has(id))),
  ];
  const [{ data: extraPosts }, { data: extraComments }] = await Promise.all([
    extraPostIds.length
      ? supabase
          .from("posts")
          .select("id, author_name, author_role, title, body, status, created_at")
          .in("id", extraPostIds)
          .overrideTypes<PostRow[], { merge: false }>()
      : Promise.resolve({ data: [] as PostRow[] }),
    extraCommentIds.length
      ? supabase
          .from("comments")
          .select("id, post_id, author_name, author_role, body, status, created_at")
          .in("id", extraCommentIds)
          .overrideTypes<CommentRow[], { merge: false }>()
      : Promise.resolve({ data: [] as CommentRow[] }),
  ]);
  for (const p of extraPosts ?? []) posts.set(p.id, p);
  for (const c of extraComments ?? []) comments.set(c.id, c);

  const items: Item[] = [
    ...[...posts.values()].map<Item>((p) => ({
      key: `p-${p.id}`,
      type: "post",
      id: p.id,
      postId: p.id,
      status: p.status,
      author: p.author_name,
      role: p.author_role,
      title: p.title,
      body: p.body,
      createdAt: p.created_at,
      reports: reports.filter((r) => r.post_id === p.id),
    })),
    ...[...comments.values()].map<Item>((c) => ({
      key: `c-${c.id}`,
      type: "comment",
      id: c.id,
      postId: c.post_id,
      status: c.status,
      author: c.author_name,
      role: c.author_role,
      body: c.body,
      createdAt: c.created_at,
      reports: reports.filter((r) => r.comment_id === c.id),
    })),
  ]
    .filter((item) => item.status !== "deleted")
    .sort(
      (a, b) =>
        Number(b.status === "review") - Number(a.status === "review") ||
        b.reports.length - a.reports.length ||
        b.createdAt.localeCompare(a.createdAt),
    );

  const waiting = items.filter((i) => i.status === "review");
  const watching = items.filter((i) => i.status === "published");

  return (
    <div className="flex flex-col gap-6">
      <CommunityHeader
        eyebrow="학교 관리 공간"
        title="커뮤니티 신고 관리"
        description="신고된 글과 댓글을 확인하고 복구하거나 삭제합니다. 처리 내용은 이력으로 남습니다."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/community">커뮤니티 보기</Link>
          </Button>
        }
      />

      <QueuePanel
        title="검토 대기"
        hint="숨겨진 글과 댓글입니다. 내용을 확인하고 복구하거나 삭제하세요."
        empty="검토를 기다리는 항목이 없습니다."
        items={waiting}
      />
      <QueuePanel
        title="신고 접수 중"
        hint="아직 게시 중입니다. 서로 다른 사용자 3명이 신고하면 자동으로 숨겨집니다."
        empty="신고가 접수된 게시 중인 항목이 없습니다."
        items={watching}
      />

      <section className="school-panel">
        <div className="school-panel-heading">
          <h3 className="school-panel-title">
            <History className="size-[18px] text-primary" aria-hidden="true" />
            처리 이력
            <span className="text-sm font-normal text-muted-foreground">최근 30건</span>
          </h3>
        </div>
        {(logRows ?? []).length === 0 ? (
          <EmptyState title="아직 처리 기록이 없습니다." detail="자동 숨김과 관리자 처리 내용이 이곳에 쌓입니다." />
        ) : (
          <ul className="divide-y">
            {(logRows ?? []).map((log) => (
              <li key={log.id} className="px-4 py-3 sm:px-5">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={log.action === "delete" ? "destructive" : "secondary"}>{ACTION_LABEL[log.action]}</Badge>
                  <span>{log.target_type === "post" ? "글" : "댓글"}</span>
                  <span>{log.actor?.name ?? "시스템"}</span>
                  <span>{formatDateTime(log.created_at)}</span>
                </p>
                {log.target_excerpt && <p className="mt-1 text-sm wrap-break-word">{log.target_excerpt}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">사유: {log.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function QueuePanel({ title, hint, empty, items }: { title: string; hint: string; empty: string; items: Item[] }) {
  return (
    <section className="school-panel">
      <div className="school-panel-heading">
        <h3 className="school-panel-title">
          <Flag className="size-[18px] text-primary" aria-hidden="true" />
          {title}
          <span className="text-sm font-normal text-muted-foreground">{items.length}</span>
        </h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {items.length === 0 ? (
        <EmptyState title={empty} detail="새 신고가 들어오면 이곳에 표시됩니다." />
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <ItemRow key={item.key} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemRow({ item }: { item: Item }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Badge variant={item.status === "review" ? "destructive" : "secondary"}>{CONTENT_STATUS_LABEL[item.status]}</Badge>
        <span>{item.type === "post" ? "글" : "댓글"}</span>
        <span className="font-medium text-foreground">{item.author}</span>
        <span>{ROLE_LABEL[item.role]}</span>
        <span>{formatDateTime(item.createdAt)}</span>
        <Link href={`/community/${item.postId}`} className="ml-auto font-medium text-primary hover:underline">
          원문 보기
        </Link>
      </div>

      {item.title && <p className="text-sm font-semibold wrap-break-word">{item.title}</p>}
      <p className="text-sm wrap-break-word whitespace-pre-wrap">{item.body}</p>

      <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3 text-xs">
        <p className="font-semibold text-school-navy">신고 {item.reports.length}건</p>
        {item.reports.length === 0 && <p className="text-muted-foreground">신고 없이 숨겨진 항목입니다. (관리자 숨김 또는 금칙어 자동 숨김 — 처리 이력에서 사유를 확인하세요.)</p>}
        {item.reports.map((report, i) => (
          <p key={i} className="text-muted-foreground">
            {report.reason}
            <span className="ml-1">
              ({report.reporter?.name ?? "알 수 없음"}, {formatDateTime(report.created_at)})
            </span>
          </p>
        ))}
      </div>

      <ModerationForm
        postId={item.type === "post" ? item.id : undefined}
        commentId={item.type === "comment" ? item.id : undefined}
        status={item.status}
      />
    </li>
  );
}
