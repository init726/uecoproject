import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { COMMUNITY_PAGE_SIZE, CONTENT_STATUS_LABEL, POST_KIND_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Comment, Post } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Pager } from "../pager";

type MyPost = Pick<Post, "id" | "kind" | "title" | "status" | "created_at"> & { comments: { count: number }[] };
type MyComment = Pick<Comment, "id" | "post_id" | "body" | "status" | "created_at"> & {
  post: { title: string } | null;
};

const TABS = [
  { value: "posts", label: "내 글" },
  { value: "comments", label: "내 댓글" },
] as const;

export default async function MyActivityPage(props: PageProps<"/community/me">) {
  const searchParams = await props.searchParams;
  const tab = searchParams.tab === "comments" ? "comments" : "posts";
  const page = Math.max(1, Number.parseInt(String(searchParams.page ?? "1"), 10) || 1);
  const from = (page - 1) * COMMUNITY_PAGE_SIZE;
  const to = from + COMMUNITY_PAGE_SIZE - 1;

  const profile = await getProfile();
  const supabase = await createClient();

  // RLS가 삭제된 글·댓글과 숨겨진 글에 달린 댓글을 걸러낸다. 그래서 '검토 중'인 내 글은 보이지만
  // 삭제한 글은 나오지 않는다. 관리자는 RLS상 전부 보이므로 상태로 한 번 더 거른다.
  const mine =
    tab === "posts"
      ? await supabase
          .from("posts")
          .select("id, kind, title, status, created_at, comments(count)", { count: "exact" })
          .eq("author_id", profile.id)
          .neq("status", "deleted")
          .order("created_at", { ascending: false })
          .range(from, to)
          .overrideTypes<MyPost[], { merge: false }>()
      : await supabase
          .from("comments")
          .select("id, post_id, body, status, created_at, post:posts(title)", { count: "exact" })
          .eq("author_id", profile.id)
          .neq("status", "deleted")
          .order("created_at", { ascending: false })
          .range(from, to)
          .overrideTypes<MyComment[], { merge: false }>();

  const rows = mine.data ?? [];
  const totalPages = Math.max(1, Math.ceil((mine.count ?? 0) / COMMUNITY_PAGE_SIZE));
  const href = (nextTab: string, nextPage = 1) =>
    `/community/me?tab=${nextTab}${nextPage > 1 ? `&page=${nextPage}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">내 활동</h2>
        <Link href="/community" className="text-sm text-primary hover:underline">
          ← 커뮤니티
        </Link>
      </div>

      <div className="flex gap-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={href(t.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent",
              tab === t.value && "bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {t.label}
          </Link>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">총 {mine.count ?? 0}개</span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {tab === "posts" ? "아직 쓴 글이 없어요." : "아직 쓴 댓글이 없어요."}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {tab === "posts"
            ? (rows as MyPost[]).map((post) => (
                <li key={post.id}>
                  <Link href={`/community/${post.id}`}>
                    <Card size="sm" className="hover:bg-accent/50">
                      <div className="flex flex-col gap-1.5 px-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={post.kind === "notice" ? "default" : "secondary"}>
                            {POST_KIND_LABEL[post.kind]}
                          </Badge>
                          {post.status !== "published" && (
                            <Badge variant="destructive">{CONTENT_STATUS_LABEL[post.status]}</Badge>
                          )}
                          <span className="truncate font-medium">{post.title}</span>
                        </div>
                        <div className="flex items-center gap-x-2 text-xs text-muted-foreground">
                          <span>{formatDateTime(post.created_at)}</span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="size-3" />
                            {post.comments[0]?.count ?? 0}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))
            : (rows as MyComment[]).map((comment) => (
                <li key={comment.id}>
                  <Link href={`/community/${comment.post_id}`}>
                    <Card size="sm" className="hover:bg-accent/50">
                      <div className="flex flex-col gap-1.5 px-3">
                        <p className="line-clamp-2 text-sm break-words">{comment.body}</p>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {comment.status !== "published" && (
                            <Badge variant="destructive">{CONTENT_STATUS_LABEL[comment.status]}</Badge>
                          )}
                          <span className="truncate">{comment.post?.title ?? "(볼 수 없는 글)"}</span>
                          <span>{formatDateTime(comment.created_at)}</span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
        </ul>
      )}

      <Pager page={page} totalPages={totalPages} href={(p) => href(tab, p)} />
    </div>
  );
}
