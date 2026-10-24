"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

// 아래 함수들은 모두 RLS가 "담당 교사인지" 한 번 더 확인한다.
// 다른 사람이 classId를 바꿔서 보내도 데이터베이스가 거부한다.

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// CLS-02: 초대코드 재발급 (예전 코드는 더 이상 쓸 수 없다)
export async function regenerateInviteCode(classId: string) {
  const supabase = await createClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    const { error } = await supabase.from("classes").update({ invite_code: code }).eq("id", classId);
    if (!error) break; // 드물게 다른 클래스와 코드가 겹치면 다시 만든다.
  }
  revalidatePath(`/classes/${classId}`);
}

// CLS-04: 잘못 들어온 학생 내보내기
export async function removeStudent(classId: string, studentId: string) {
  const supabase = await createClient();
  await supabase.from("enrollments").delete().eq("class_id", classId).eq("student_id", studentId);
  revalidatePath(`/classes/${classId}`);
}

// CLS-05: 공지 쓰기
export async function createNotice(
  classId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title) return { error: "제목을 입력해 주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("notices")
    .insert({ class_id: classId, author_id: user.id, title, body });
  if (error) return { error: "공지를 저장하지 못했어요." };

  revalidatePath(`/classes/${classId}`);
  redirect(`/classes/${classId}?tab=notices`);
}

export async function deleteNotice(classId: string, noticeId: string) {
  const supabase = await createClient();
  await supabase.from("notices").delete().eq("id", noticeId);
  revalidatePath(`/classes/${classId}`);
}
