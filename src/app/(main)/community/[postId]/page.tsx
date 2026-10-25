import { Bookmark, BookmarkCheck, CircleCheck, MessageSquare, Pin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthUser, getProfile } from "@/lib/auth";
import { CONTENT_STATUS_LABEL, POST_KIND_LABEL } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { Comment, Post } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModerationForm } from "../../admin/community/moderation-form";
import { acceptComment, deleteComment, deletePost, setPinned, toggleBookmark } from "../actions";
import { CommentEdit } from "../comment-edit";
import { CommentForm } from "../comment-form";
import { ReportForm } from "../report-form";
import { AuthorLine, CommunityHeader, EmptyState, KindBadge, SolvedBadge, StatusBadge } from "../ui";

const isEdited = (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime() > 1000;

export default async function PostPage(props: PageProps<"/community/[postId]">) {
  const { postId } = await props.params;
  const { error } = await props.searchParams;
  const supabase = await createClient();
  // 내 아이디는 로그인 토큰에서 바로 꺼낸다(네트워크 왕복 없음). 그래서 내 정보 조회도 아래 조회들과 동시에 보낼 수 있다.
  const me = await getAuthUser();

  // RLS가 숨겨진 글·삭제된 글을 걸러낸다. 주소를 직접 쳐도 일반 사용자에게는 null이다.
  const [profile, { data: post }, { data: commentRows }, { data: myReports }, { data: myBookmark }] = await Promise.all([
    getProfile(),
    supabase.from("posts").select("*").eq("id", postId).maybeSingle<Post>(),
    supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at")
      .overrideTypes<Comment[], { merge: false }>(),
    // 내가 이미 신고한 대상 (RLS: 내 신고만 보인다)
    supabase.from("reports").select("post_id, comment_id").eq("reporter_id", me?.id ?? ""),
    // 내가 이 글을 스크랩했는지 (RLS: 내 스크랩만 보인다)
    supabase.from("bookmarks").select("post_id").eq("post_id", postId).maybeSingle(),
    // 읽음 기록. 이미 있으면 그대로 둔다. 볼 수 없는 글이거나 v6 전 DB면 조용히 실패한다.
    supabase.from("post_reads").upsert({ post_id: postId }, { onConflict: "user_id,post_id", ignoreDuplicates: true }),
  ]);
  if (!post) notFound();

  const reportedPost = (myReports ?? []).some((r) => r.post_id === post.id);
  const reportedComments = new Set((myReports ?? []).map((r) => r.comment_id).filter(Boolean));
  const bookmarked = !!myBookmark;

  const isAuthor = post.author_id === profile.id;
  const isAdmin = profile.role === "admin";
  const published = post.status === "published";
  const edited = isEdited(post.updated_at, post.created_at);

  // 채택된 답변은 맨 위에 보여 준다.
  const acceptedId = post.kind === "question" ? post.accepted_comment_id : null;
  const rawComments = commentRows ?? [];
  const comments = acceptedId
    ? [...rawComments.filter((c) => c.id === acceptedId), ...rawComments.filter((c) => c.id !== acceptedId)]
    : rawComments;
  const liveComments = rawComments.filter((c) => c.status === "published").length;
  const canAccept = isAuthor && published && post.kind === "question";

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
              "신고가 접수되어 관리자가 검토하는 중입니다. 다른 사용자에게는 보이지 않습니다."
            )}
          </AlertDescription>
        </Alert>
      )}

      <article className="school-panel">
        <div className="school-panel-heading">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {post.pinned && <Pin className="size-4 text-primary" aria-label="고정된 글" />}
            <KindBadge kind={post.kind} />
            {acceptedId && <SolvedBadge />}
            <StatusBadge status={post.status} />
            <AuthorLine name={post.author_name} role={post.author_role} createdAt={post.created_at} />
            {edited && <span>수정됨</span>}
          </div>
        </div>
        <p className="px-4 py-5 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap sm:px-5">{post.body}</p>

        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-5">
          {published && (
            <form action={toggleBookmark.bind(null, post.id, !bookmarked)}>
              <SubmitButton variant={bookmarked ? "secondary" : "outline"} size="sm" pendingText="처리 중...">
                {bookmarked ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                {bookmarked ? "스크랩함" : "스크랩"}
              </SubmitButton>
            </form>
          )}
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

      {isAdmin && post.status !== "deleted" && (
        <details className="school-panel px-4 py-3 sm:px-5">
          <summary className="cursor-pointer text-sm font-semibold">관리자 처리 (숨김·삭제)</summary>
          <div className="mt-3">
            <ModerationForm postId={post.id} status={post.status} />
          </div>
        </details>
      )}

      <section className="school-panel">
        <div className="school-panel-heading">
          <h3 className="school-panel-title">
            <MessageSquare className="size-[18px] text-primary" aria-hidden="true" />
            댓글
            <span className="text-sm font-normal text-muted-foreground">{liveComments}</span>
          </h3>
          {canAccept && !acceptedId && liveComments > 0 && (
            <p className="text-xs text-muted-foreground">도움이 된 답변에서 &apos;채택&apos;을 눌러 질문을 해결됨으로 표시하세요.</p>
          )}
        </div>

        {comments.length === 0 ? (
          <EmptyState title="아직 댓글이 없습니다." detail={published ? "첫 댓글을 남겨 보세요." : "이 글에는 댓글이 없습니다."} />
        ) : (
          <ul className="divide-y">
            {comments.map((comment) => {
              const mine = comment.author_id === profile.id;
              const live = comment.status === "published";
              const isAccepted = comment.id === acceptedId;
              return (
                <li
                  key={comment.id}
                  className={cn(
                    "p-4 sm:px-5",
                    !live && "bg-muted/40",
                    isAccepted && "border-l-4 border-l-primary bg-accent/40",
                  )}
                >
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    {isAccepted && (
                      <Badge variant="default">
                        <CircleCheck aria-hidden="true" />
                        채택된 답변
                      </Badge>
                    )}
                    <AuthorLine name={comment.author_name} role={comment.author_role} createdAt={comment.created_at} />
                    {isEdited(comment.updated_at, comment.created_at) && <span>수정됨</span>}
                    {!live && <Badge variant="outline">{CONTENT_STATUS_LABEL[comment.status]}</Badge>}
                  </p>
                  <p className="mt-1.5 text-sm wrap-break-word whitespace-pre-wrap">{comment.body}</p>
                  {live && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {canAccept && !mine && (
                        <form action={acceptComment.bind(null, post.id, isAccepted ? null : comment.id)}>
                          <SubmitButton variant={isAccepted ? "ghost" : "outline"} size="xs" pendingText="처리 중...">
                            <CircleCheck aria-hidden="true" />
                            {isAccepted ? "채택 취소" : "채택"}
                          </SubmitButton>
                        </form>
                      )}
                      {mine ? (
                        <>
                          {published && (
                            <CommentEdit postId={post.id} commentId={comment.id} body={comment.body} />
                          )}
                          <form action={deleteComment.bind(null, post.id, comment.id)}>
                            <ConfirmButton variant="ghost" size="xs" confirm="이 댓글을 삭제할까요?">
                              삭제
                            </ConfirmButton>
                          </form>
                        </>
                      ) : reportedComments.has(comment.id) ? (
                        <span className="text-xs text-muted-foreground">신고한 댓글입니다.</span>
                      ) : (
                        <ReportForm commentId={comment.id} redirectTo={`/community/${post.id}`} />
                      )}
                    </div>
                  )}
                  {isAdmin && !mine && comment.status !== "deleted" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">관리자 처리</summary>
                      <div className="mt-2 max-w-md">
                        <ModerationForm commentId={comment.id} status={comment.status} />
                      </div>
                    </details>
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
