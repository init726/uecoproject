import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getAuthUser, getProfile } from "@/lib/auth";
import { COMMUNITY_PAGE_SIZE } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Comment, Post, Role } from "@/lib/types";
import { Pager } from "../pager";
import { chipClass, CommunityHeader, EmptyState, PostRow, StatusBadge } from "../ui";

type MyPost = Pick<
  Post,
  "id" | "kind" | "title" | "pinned" | "status" | "created_at" | "accepted_comment_id" | "comment_count"
>;
// 스크랩한 글. 숨겨지거나 삭제된 글은 posts 의 RLS 때문에 !inner 조인에서 빠진다.
type MyBookmark = { created_at: string; post: MyPost & { author_name: string; author_role: Role } };
type MyComment = Pick<Comment, "id" | "post_id" | "body" | "status" | "created_at"> & {
  post: { title: string } | null;
};

const TABS = [
  { value: "posts", label: "내 글" },
  { value: "comments", label: "내 댓글" },
  { value: "bookmarks", label: "스크랩" },
] as const;

export default async function MyActivityPage(props: PageProps<"/community/me">) {
  const searchParams = await props.searchParams;
  const tab = searchParams.tab === "comments" ? "comments" : searchParams.tab === "bookmarks" ? "bookmarks" : "posts";
  const page = Math.max(1, Number.parseInt(String(searchParams.page ?? "1"), 10) || 1);
  const from = (page - 1) * COMMUNITY_PAGE_SIZE;
  const to = from + COMMUNITY_PAGE_SIZE - 1;

  const supabase = await createClient();
  // 내 아이디는 로그인 토큰에서 바로 꺼낸다(네트워크 왕복 없음). 로그인·권한 확인은 아래 조회와 동시에 한다.
  const me = await getAuthUser();
  const myId = me?.id ?? "";

  // RLS가 삭제된 글·댓글과 숨겨진 글에 달린 댓글을 걸러낸다. 그래서 '검토 중'인 내 글은 보이지만
  // 삭제한 글은 나오지 않는다. 관리자는 RLS상 전부 보이므로 상태로 한 번 더 거른다.
  const minePromise =
    tab === "bookmarks"
      ? supabase
          .from("bookmarks")
          .select(
            "created_at, post:posts!inner(id, kind, title, pinned, status, created_at, accepted_comment_id, comment_count, author_name, author_role)",
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(from, to)
          .overrideTypes<MyBookmark[], { merge: false }>()
      : tab === "posts"
      ? supabase
          .from("posts")
          .select("id, kind, title, pinned, status, created_at, accepted_comment_id, comment_count", { count: "exact" })
          .eq("author_id", myId)
          .neq("status", "deleted")
          .order("created_at", { ascending: false })
          .range(from, to)
          .overrideTypes<MyPost[], { merge: false }>()
      : supabase
          .from("comments")
          .select("id, post_id, body, status, created_at, post:posts!comments_post_id_fkey(title)", { count: "exact" })
          .eq("author_id", myId)
          .neq("status", "deleted")
          .order("created_at", { ascending: false })
          .range(from, to)
          .overrideTypes<MyComment[], { merge: false }>();

  const [, mine] = await Promise.all([getProfile(), minePromise]);

  const rows = mine.data ?? [];
  const totalPages = Math.max(1, Math.ceil((mine.count ?? 0) / COMMUNITY_PAGE_SIZE));
  const href = (nextTab: string, nextPage = 1) =>
    `/community/me?tab=${nextTab}${nextPage > 1 ? `&page=${nextPage}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <CommunityHeader
        title="내 활동"
        description="내가 쓴 글과 댓글을 모아 봅니다."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/community">커뮤니티로</Link>
          </Button>
        }
      />

      <section className="school-panel">
        <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2 sm:px-4">
          {TABS.map((t) => (
            <Link key={t.value} href={href(t.value)} className={chipClass(tab === t.value)}>
              {t.label}
            </Link>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">총 {mine.count ?? 0}개</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={
              tab === "posts" ? "아직 쓴 글이 없습니다." : tab === "comments" ? "아직 쓴 댓글이 없습니다." : "스크랩한 글이 없습니다."
            }
            detail={
              tab === "posts"
                ? "커뮤니티에 첫 글을 남겨 보세요."
                : tab === "comments"
                  ? "다른 사람의 글에 댓글을 남겨 보세요."
                  : "글 아래의 스크랩 버튼을 누르면 이곳에 모입니다."
            }
          />
        ) : (
          <div className="divide-y">
            {tab === "bookmarks"
              ? (rows as MyBookmark[]).map((b) => <PostRow key={b.post.id} post={b.post} />)
              : tab === "posts"
              ? (rows as MyPost[]).map((post) => <PostRow key={post.id} post={post} />)
              : (rows as MyComment[]).map((comment) => (
                  <Link
                    key={comment.id}
                    href={`/community/${comment.post_id}`}
                    className="group flex min-w-0 items-start gap-3 p-4 transition-colors hover:bg-accent/40 sm:px-5"
                  >
                    <span
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"
                      aria-hidden="true"
                    >
                      <MessageSquare className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{comment.post?.title ?? "볼 수 없는 글"}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-semibold wrap-break-word group-hover:text-primary">
                        {comment.body}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <StatusBadge status={comment.status} />
                        {formatDateTime(comment.created_at)}
                      </p>
                    </div>
                  </Link>
                ))}
          </div>
        )}
      </section>

      <Pager page={page} totalPages={totalPages} href={(p) => href(tab, p)} />
    </div>
  );
}
