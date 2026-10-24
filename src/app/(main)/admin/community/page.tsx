import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-mono text-xl font-bold">커뮤니티 신고 관리</h2>
        <Link href="/community" className="text-sm text-primary hover:underline">
          커뮤니티 보기 →
        </Link>
      </div>

      <Section title={`검토 대기 ${waiting.length}`} hint="숨겨진 글·댓글이에요. 내용을 확인하고 복구하거나 삭제하세요.">
        {waiting.map((item) => (
          <ItemCard key={item.key} item={item} />
        ))}
      </Section>

      <Section title={`신고 접수 중 ${watching.length}`} hint="아직 게시 중이에요. 서로 다른 사용자 3명이 신고하면 자동으로 숨겨져요.">
        {watching.map((item) => (
          <ItemCard key={item.key} item={item} />
        ))}
      </Section>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">처리 이력</h3>
        {(logRows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 처리 기록이 없어요.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {(logRows ?? []).map((log) => (
              <li key={log.id} className="flex flex-col gap-0.5 px-3 py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={log.action === "delete" ? "destructive" : "secondary"}>
                    {ACTION_LABEL[log.action]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {log.target_type === "post" ? "글" : "댓글"} · {log.actor?.name ?? "시스템"} ·{" "}
                    {formatDateTime(log.created_at)}
                  </span>
                </p>
                {log.target_excerpt && <p className="truncate">{log.target_excerpt}</p>}
                <p className="text-xs text-muted-foreground">사유: {log.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children.length === 0 ? <p className="text-sm text-muted-foreground">없어요.</p> : children}
    </section>
  );
}

function ItemCard({ item }: { item: Item }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={item.status === "review" ? "destructive" : "secondary"}>
            {CONTENT_STATUS_LABEL[item.status]}
          </Badge>
          <span>{item.type === "post" ? "글" : "댓글"}</span>
          <span>
            {item.author} · {ROLE_LABEL[item.role]} · {formatDateTime(item.createdAt)}
          </span>
          <Link href={`/community/${item.postId}`} className="ml-auto text-primary hover:underline">
            원문 보기 →
          </Link>
        </div>

        {item.title && <p className="font-medium break-words">{item.title}</p>}
        <p className="text-sm break-words whitespace-pre-wrap">{item.body}</p>

        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-xs">
          <p className="font-medium">신고 {item.reports.length}건</p>
          {item.reports.length === 0 && <p className="text-muted-foreground">관리자가 직접 숨긴 항목이에요.</p>}
          {item.reports.map((report, i) => (
            <p key={i} className="text-muted-foreground">
              · {report.reason}
              <span className="ml-1 opacity-70">
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
      </CardContent>
    </Card>
  );
}
