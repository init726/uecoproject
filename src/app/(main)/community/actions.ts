"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, requireAdmin } from "@/lib/auth";
import { dbMessage, isPostKind, writableKinds } from "@/lib/community";
import { maskBannedWords } from "@/lib/community-mask";
import { COMMENT_MAX, POST_BODY_MAX, POST_TITLE_MAX, REASON_MAX } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, Role } from "@/lib/types";

// 권한은 데이터베이스(RLS·트리거·함수)가 최종적으로 막는다.
// 여기서는 입력을 다듬고, 데이터베이스가 던진 한국어 사유를 사용자에게 돌려준다.

function readPostFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
  };
}

function validatePost({ title, body }: { title: string; body: string }) {
  if (!title) return "제목을 입력해 주세요.";
  if (!body) return "내용을 입력해 주세요.";
  if (title.length > POST_TITLE_MAX) return `제목은 ${POST_TITLE_MAX}자까지 쓸 수 있어요.`;
  if (body.length > POST_BODY_MAX) return `내용은 ${POST_BODY_MAX}자까지 쓸 수 있어요.`;
  return null;
}

// 금칙어를 *로 바꾼다. (관리자의 글은 그대로 둔다)
function maskFields(role: Role, fields: { title: string; body: string }) {
  if (role === "admin") return { ...fields, changed: false };
  const title = maskBannedWords(fields.title);
  const body = maskBannedWords(fields.body);
  return { title: title.text, body: body.text, changed: title.changed || body.changed };
}

export async function createPost(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getProfile();
  const fields = readPostFields(formData);
  const kind = formData.get("kind");
  if (!isPostKind(kind) || !writableKinds(profile).includes(kind)) {
    return { error: "글 종류를 다시 선택해 주세요." };
  }
  const invalid = validatePost(fields);
  if (invalid) return { error: invalid };
  const masked = maskFields(profile.role, fields);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    // 작성자 이름·역할·상태는 트리거가 채우므로 보내지 않는다.
    .insert({
      author_id: profile.id,
      kind,
      pinned: kind === "notice" && formData.get("pinned") === "on",
      title: masked.title,
      body: masked.body,
    })
    .select("id")
    .single();
  if (error || !data) return { error: dbMessage(error ?? { message: "" }, "글을 저장하지 못했어요.") };

  revalidatePath("/community");
  redirect(`/community/${data.id}${masked.changed ? "?masked=1" : ""}`);
}

export async function updatePost(
  postId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  const fields = readPostFields(formData);
  const invalid = validatePost(fields);
  if (invalid) return { error: invalid };
  const masked = maskFields(profile.role, fields);

  const supabase = await createClient();
  // RLS: 내 글만. 트리거: 게시 중인 글의 제목·본문만. 조건에 안 맞으면 0행이 바뀐다.
  const { data, error } = await supabase
    .from("posts")
    .update({ title: masked.title, body: masked.body })
    .eq("id", postId)
    .select("id");
  if (error) return { error: dbMessage(error, "글을 수정하지 못했어요.") };
  if (!data?.length) return { error: "수정할 수 없는 글이에요." };

  revalidatePath("/community");
  redirect(`/community/${postId}${masked.changed ? "?masked=1" : ""}`);
}

export async function deletePost(postId: string) {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_post", { p_post_id: postId });
  if (error) redirect(`/community/${postId}?error=${encodeURIComponent(dbMessage(error, "글을 삭제하지 못했어요."))}`);

  revalidatePath("/community");
  redirect("/community");
}

export async function createComment(
  postId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "댓글을 입력해 주세요." };
  if (body.length > COMMENT_MAX) return { error: `댓글은 ${COMMENT_MAX}자까지 쓸 수 있어요.` };

  // 금칙어는 *로 바꿔서 저장한다. (관리자는 그대로)
  const masked = profile.role === "admin" ? { text: body, changed: false } : maskBannedWords(body);

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .insert({ post_id: postId, author_id: profile.id, body: masked.text });
  if (error) return { error: dbMessage(error, "댓글을 저장하지 못했어요.") };

  revalidatePath(`/community/${postId}`);
  return { message: masked.changed ? "댓글을 달았어요. 부적절한 표현은 *로 바뀌었어요." : "댓글을 달았어요." };
}

export async function deleteComment(postId: string, commentId: string) {
  await getProfile();
  const supabase = await createClient();
  await supabase.rpc("delete_comment", { p_comment_id: commentId });
  revalidatePath(`/community/${postId}`);
}

// 글 또는 댓글 신고. 같은 사람의 중복 신고와 3명 누적 자동 숨김은 데이터베이스 함수가 처리한다.
export async function reportContent(
  target: { postId?: string; commentId?: string; redirectTo: string },
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await getProfile();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "신고 사유를 입력해 주세요." };
  if (reason.length > REASON_MAX) return { error: `신고 사유는 ${REASON_MAX}자까지 쓸 수 있어요.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_content", {
    p_post_id: target.postId ?? null,
    p_comment_id: target.commentId ?? null,
    p_reason: reason,
  });
  if (error) return { error: dbMessage(error, "신고하지 못했어요.") };

  revalidatePath(target.redirectTo);
  return { message: "신고했어요. 관리자가 확인할 거예요." };
}

// 공지 상단 고정/해제 (관리자)
export async function setPinned(postId: string, pinned: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.rpc("set_post_pinned", { p_post_id: postId, p_pinned: pinned });
  revalidatePath("/community");
  revalidatePath(`/community/${postId}`);
}

// 알림 모두 읽음. 메뉴의 알림 배지도 함께 갱신되도록 레이아웃까지 다시 그린다.
export async function markAllNotificationsRead() {
  await getProfile();
  const supabase = await createClient();
  await supabase.rpc("mark_all_notifications_read");
  revalidatePath("/", "layout");
}
