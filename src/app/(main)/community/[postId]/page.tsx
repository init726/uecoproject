import { MessageSquare, Pin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { CONTENT_STATUS_LABEL, POST_KIND_LABEL } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { Comment, Post } from "@/lib/types";
import { deleteComment, deletePost, setPinned } from "../actions";
import { CommentForm } from "../comment-form";
import { ReportForm } from "../report-form";
import { AuthorLine, CommunityHeader, EmptyState, KindBadge, StatusBadge } from "../ui";

export default async function PostPage(props: PageProps<"/community/[postId]">) {
  const { postId } = await props.params;
  const { error } = await props.searchParams;
  const profile = await getProfile();
  const supabase = await createClient();

  // RLS가 숨겨진 글·삭제된 글을 걸러낸다. 주소를 직접 쳐도 일반 사용자에게는 null이다.
  const [{ data: post }, { data: commentRows }, { data: myReports }] = await Promise.all([
    supabase.from("posts").select("*").eq("id", postId).maybeSingle<Post>(),
    supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at")
      .overrideTypes<Comment[], { merge: false }>(),
    // 내가 이미 신고한 대상 (RLS: 내 신고만 보인다)
    supabase.from("reports").select("post_id, comment_id").eq("reporter_id", profile.id),
  ]);
  if (!post) notFound();

  const comments = commentRows ?? [];
  const reportedPost = (myReports ?? []).some((r) => r.post_id === post.id);
  const reportedComments = new Set((myReports ?? []).map((r) => r.comment_id).filter(Boolean));

  const isAuthor = post.author_id === profile.id;
  const isAdmin = profile.role === "admin";
  const published = post.status === "published";
  const edited = new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 1000;
  const liveComments = comments.filter((c) => c.status === "published").length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <CommunityHeader
        eyebrow={POST_KIND_LABEL[post.kind]}
        title={post.title}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/community">목록으로</Link>
          </Button>
        }
      />

      {typeof error === "string" && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!published && (
        <Alert>
          <AlertDescription>
            {isAdmin ? (
              <>
                이 글은 {CONTENT_STATUS_LABEL[post.status]} 상태라 일반 사용자에게 보이지 않습니다.{" "}
                <Link href="/admin/community" className="font-medium underline">
                  신고 관리로 이동
                </Link>
              </>
            ) : (
              "관리자가 검토하는 중입니다. 검토가 끝나기 전에는 다른 사용자에게 보이지 않습니다."
            )}
          </AlertDescription>
        </Alert>
      )}

      <article className="school-panel">
        <div className="school-panel-heading">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {post.pinned && <Pin className="size-4 text-primary" aria-label="고정된 글" />}
            <KindBadge kind={post.kind} />
            <StatusBadge status={post.status} />
            <AuthorLine name={post.author_name} role={post.author_role} createdAt={post.created_at} />
            {edited && <span>수정됨</span>}
          </div>
        </div>
        <p className="px-4 py-5 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap sm:px-5">{post.body}</p>

        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-5">
          {isAuthor && published && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/community/${post.id}/edit`}>수정</Link>
              </Button>
              <form action={deletePost.bind(null, post.id)}>
                <ConfirmButton variant="destructive" size="sm" confirm="이 글을 삭제할까요?">
                  삭제
                </ConfirmButton>
              </form>
            </>
          )}
          {isAdmin && post.kind === "notice" && published && (
            <form action={setPinned.bind(null, post.id, !post.pinned)}>
              <SubmitButton variant="outline" size="sm">
                {post.pinned ? "고정 해제" : "상단 고정"}
              </SubmitButton>
            </form>
          )}
          {!isAuthor && published &&
            (reportedPost ? (
              <span className="text-xs text-muted-foreground">신고한 글입니다.</span>
            ) : (
              <ReportForm postId={post.id} redirectTo={`/community/${post.id}`} />
            ))}
        </div>
      </article>

      <section className="school-panel">
        <div className="school-panel-heading">
          <h3 className="school-panel-title">
            <MessageSquare className="size-[18px] text-primary" aria-hidden="true" />
            댓글
            <span className="text-sm font-normal text-muted-foreground">{liveComments}</span>
          </h3>
        </div>

        {comments.length === 0 ? (
          <EmptyState title="아직 댓글이 없습니다." detail={published ? "첫 댓글을 남겨 보세요." : "이 글에는 댓글이 없습니다."} />
        ) : (
          <ul className="divide-y">
            {comments.map((comment) => {
              const mine = comment.author_id === profile.id;
              const live = comment.status === "published";
              return (
                <li key={comment.id} className={live ? "p-4 sm:px-5" : "bg-muted/40 p-4 sm:px-5"}>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <AuthorLine name={comment.author_name} role={comment.author_role} createdAt={comment.created_at} />
                    {!live && <Badge variant="outline">{CONTENT_STATUS_LABEL[comment.status]}</Badge>}
                  </p>
                  <p className="mt-1.5 text-sm wrap-break-word whitespace-pre-wrap">{comment.body}</p>
                  {live && (
                    <div className="mt-2 flex items-center gap-3">
                      {mine ? (
                        <form action={deleteComment.bind(null, post.id, comment.id)}>
                          <ConfirmButton variant="ghost" size="xs" confirm="이 댓글을 삭제할까요?">
                            삭제
                          </ConfirmButton>
                        </form>
                      ) : reportedComments.has(comment.id) ? (
                        <span className="text-xs text-muted-foreground">신고한 댓글입니다.</span>
                      ) : (
                        <ReportForm commentId={comment.id} redirectTo={`/community/${post.id}`} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {published && (
          <div className="border-t p-4 sm:p-5">
            <CommentForm postId={post.id} />
          </div>
        )}
      </section>
    </div>
  );
}
