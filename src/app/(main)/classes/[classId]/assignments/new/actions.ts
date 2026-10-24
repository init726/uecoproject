"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { kstLocalToIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

// ASG-01: 과제 만들기. 수행평가(파일)와 생기부 글쓰기(글)를 type 하나로 구분한다.
export async function createAssignment(
  classId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rubric = String(formData.get("rubric") ?? "").trim();
  const type = formData.get("type") === "text" ? "text" : "file";
  const dueAt = kstLocalToIso(String(formData.get("due_at") ?? ""));
  const maxChars = Number(formData.get("max_chars") ?? 0);
  const allowLate = formData.get("allow_late") === "on";

  if (!title) return { error: "제목을 입력해 주세요." };
  if (!dueAt) return { error: "마감 일시를 입력해 주세요." };
  if (type === "text" && !(maxChars >= 50 && maxChars <= 10000)) {
    return { error: "글자 수 제한은 50~10000자 사이로 정해 주세요." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      class_id: classId,
      title,
      description,
      rubric,
      type,
      due_at: dueAt,
      max_chars: type === "text" ? maxChars : null,
      allow_late: allowLate,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "과제를 저장하지 못했어요." };

  revalidatePath(`/classes/${classId}`);
  redirect(`/assignments/${data.id}`);
}
