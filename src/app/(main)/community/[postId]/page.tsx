import { Pin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getProfile } from "@/lib/auth";
import { CONTENT_STATUS_LABEL, POST_KIND_LABEL, ROLE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Comment, Post } from "@/lib/types";
import { deleteComment, deletePost, setPinned } from "../actions";
import { CommentForm } from "../comment-form";
import { ReportForm } from "../report-form";

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/community" className="text-sm text-muted-foreground hover:underline">
        ← 목록
      </Link>

      {typeof error === "string" && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!published && (
        <Alert>
          <AlertDescription>
            {isAdmin
              ? `이 글은 ${CONTENT_STATUS_LABEL[post.status]} 상태라 일반 사용자에게 보이지 않아요.`
              : "신고가 접수되어 관리자가 검토하는 중이에요. 다른 사용자에게는 보이지 않아요."}
            {isAdmin && (
              <>
                {" "}
                <Link href="/admin/community" className="underline">
                  신고 관리로 이동
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {post.pinned && <Pin className="size-4 text-primary" />}
            <Badge variant={post.kind === "notice" ? "default" : "secondary"}>{POST_KIND_LABEL[post.kind]}</Badge>
            {!published && <Badge variant="outline">{CONTENT_STATUS_LABEL[post.status]}</Badge>}
          </div>
          <h2 className="text-xl font-bold break-words">{post.title}</h2>
          <p className="text-xs text-muted-foreground">
            {post.author_name} · {ROLE_LABEL[post.author_role]} · {formatDateTime(post.created_at)}
            {edited && " (수정됨)"}
          </p>
          <Separator />
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{post.body}</p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
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
                <span className="text-sm text-muted-foreground">신고한 글이에요</span>
              ) : (
                <ReportForm postId={post.id} redirectTo={`/community/${post.id}`} />
              ))}
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">댓글 {comments.filter((c) => c.status === "published").length}</h3>
        {comments.length === 0 && <p className="text-sm text-muted-foreground">아직 댓글이 없어요.</p>}
        <ul className="flex flex-col gap-2">
          {comments.map((comment) => {
            const mine = comment.author_id === profile.id;
            const live = comment.status === "published";
            return (
              <li key={comment.id}>
                <Card size="sm" className={live ? undefined : "opacity-60"}>
                  <CardContent className="flex flex-col gap-1.5">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{comment.author_name}</span>
                      {ROLE_LABEL[comment.author_role]} · {formatDateTime(comment.created_at)}
                      {!live && <Badge variant="outline">{CONTENT_STATUS_LABEL[comment.status]}</Badge>}
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>
                    {live && (
                      <div className="flex items-center gap-3 pt-1">
                        {mine ? (
                          <form action={deleteComment.bind(null, post.id, comment.id)}>
                            <ConfirmButton variant="ghost" size="xs" confirm="이 댓글을 삭제할까요?">
                              삭제
                            </ConfirmButton>
                          </form>
                        ) : reportedComments.has(comment.id) ? (
                          <span className="text-xs text-muted-foreground">신고한 댓글이에요</span>
                        ) : (
                          <ReportForm commentId={comment.id} redirectTo={`/community/${post.id}`} />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
        {published && <CommentForm postId={post.id} />}
      </section>
    </div>
  );
}
