"use server";

import { getAuthUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

// 제출 시각, 마감 후 제출 여부, 버전은 데이터베이스 트리거(prepare_submission)가 정한다.
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
  const user = await getAuthUser(); // 로그인 토큰을 서버에서 바로 검증한다 (Supabase 왕복 없음)
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("submissions")
    .insert({ assignment_id: assignmentId, student_id: user.id, content });
  if (error) return { error: toMessage(error) };

  revalidatePath("/", "layout");
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
  const user = await getAuthUser(); // 로그인 토큰을 서버에서 바로 검증한다 (Supabase 왕복 없음)
  if (!user) redirect("/login");

  const { error } = await supabase.from("submissions").insert({
    assignment_id: assignmentId,
    student_id: user.id,
    file_path: filePath,
    file_name: fileName.slice(0, 200),
  });
  if (error) return { error: toMessage(error) };

  revalidatePath("/", "layout");
  return { message: "제출했어요." };
}

export async function cancelSubmission(assignmentId: string, _prev: ActionState): Promise<ActionState> {
  void _prev;
  const { requireRole } = await import("@/lib/auth");
  await requireRole("student");
  const client = await createClient();
  const { error } = await client.rpc("cancel_submission", { p_assignment_id: assignmentId });
  if (error) return { error: toMessage(error) };
  revalidatePath("/", "layout");
  return { message: "제출을 취소했습니다. 이전 기록은 보존됩니다." };
}

export async function saveFeedback(submissionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { requireRole } = await import("@/lib/auth");
  await requireRole("teacher");
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 5000) return { error: "피드백은 1~5000자 이내로 작성해 주세요." };
  const client = await createClient();
  const { error } = await client.rpc("save_submission_feedback", { p_submission_id: submissionId, p_body: body });
  if (error) return { error: toMessage(error) };
  revalidatePath("/", "layout");
  return { message: "피드백을 저장했습니다." };
}

// 참고 자료 기록. 파일은 교사 브라우저가 저장소(assignment-files)에 먼저 올리고 여기서는 경로만 남긴다.
// 담당 교사인지, 그 과제 폴더의 실제 파일인지는 RLS와 트리거(prepare_assignment_file)가 확인한다.
export async function recordAssignmentFile(assignmentId: string, filePath: string, fileName: string): Promise<ActionState> {
  const { requireRole } = await import("@/lib/auth");
  await requireRole("teacher");
  const client = await createClient();
  const { error } = await client
    .from("assignment_files")
    .insert({ assignment_id: assignmentId, file_path: filePath, file_name: fileName.slice(0, 200) });
  if (error) {
    await client.storage.from("assignment-files").remove([filePath]); // 기록이 안 되면 올린 파일도 치운다
    return { error: error.code === "P0001" ? error.message : "자료를 등록하지 못했어요." };
  }
  revalidatePath(`/assignments/${assignmentId}`);
  return { message: "참고 자료를 올렸어요." };
}

export async function deleteAssignmentFile(assignmentId: string, fileId: string) {
  const { requireRole } = await import("@/lib/auth");
  await requireRole("teacher");
  const client = await createClient();
  const { data } = await client.from("assignment_files").delete().eq("id", fileId).select("file_path");
  if (data?.[0]) await client.storage.from("assignment-files").remove([data[0].file_path]);
  revalidatePath(`/assignments/${assignmentId}`);
}

// 과제 취소. 기록은 지우지 않고 취소 표시만 한다. (학생 제출물은 보존, 모든 화면에서 숨김)
export async function cancelAssignment(assignmentId: string, classId: string) {
  const { requireRole } = await import("@/lib/auth");
  await requireRole("teacher");
  const client = await createClient();
  const { error } = await client.rpc("cancel_assignment", { p_assignment_id: assignmentId });
  if (error) {
    const message = error.code === "P0001" ? error.message : "과제를 취소하지 못했어요. DB 업데이트를 확인해 주세요.";
    redirect(`/assignments/${assignmentId}/edit?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/", "layout");
  redirect(`/classes/${classId}`);
}
