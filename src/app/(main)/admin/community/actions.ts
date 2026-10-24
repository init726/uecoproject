"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { dbMessage } from "@/lib/community";
import { REASON_MAX } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const ACTIONS = ["hide", "restore", "delete"];

// 신고된 글·댓글을 숨김/복구/삭제한다. 내용을 고치지는 않는다.
// 처리한 사람·시각·사유는 데이터베이스 함수가 moderation_logs 에 남긴다.
export async function moderateContent(
  target: { postId?: string; commentId?: string },
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!ACTIONS.includes(action)) return { error: "처리 방법을 선택해 주세요." };
  if (!reason) return { error: "처리 사유를 입력해 주세요." };
  if (reason.length > REASON_MAX) return { error: `처리 사유는 ${REASON_MAX}자까지 쓸 수 있어요.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_content", {
    p_post_id: target.postId ?? null,
    p_comment_id: target.commentId ?? null,
    p_action: action,
    p_reason: reason,
  });
  if (error) return { error: dbMessage(error, "처리하지 못했어요.") };

  revalidatePath("/admin/community");
  revalidatePath("/community", "layout");
  return { message: "처리했어요." };
}
