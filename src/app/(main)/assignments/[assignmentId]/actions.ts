"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

// 제출 시각, 지각 여부, 버전은 데이터베이스 트리거(prepare_submission)가 정한다.
// 트리거가 거부하면(마감, 글자 수 초과 등) 그 이유를 그대로 보여준다.
function toMessage(error: { code?: string; message: string }) {
  return error.code === "P0001" ? error.message : "제출하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

// ASG-03: 글 제출
export async function submitText(
  assignmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const content = String(formData.get("content") ?? "");
  if (!content.trim()) return { error: "내용을 입력해 주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("submissions")
    .insert({ assignment_id: assignmentId, student_id: user.id, content });
  if (error) return { error: toMessage(error) };

  revalidatePath(`/assignments/${assignmentId}`);
  return { message: "제출했어요." };
}

// ASG-02: 파일 제출 기록. 파일은 브라우저가 저장소에 먼저 올리고, 여기서는 경로만 기록한다.
// (서버 액션은 1MB까지만 받을 수 있어서 10MB 파일을 서버로 보내지 않는다)
export async function recordFileSubmission(
  assignmentId: string,
  filePath: string,
  fileName: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("submissions").insert({
    assignment_id: assignmentId,
    student_id: user.id,
    file_path: filePath,
    file_name: fileName.slice(0, 200),
  });
  if (error) return { error: toMessage(error) };

  revalidatePath(`/assignments/${assignmentId}`);
  return { message: "제출했어요." };
}
