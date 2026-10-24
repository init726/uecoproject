"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

// CLS-01, CLS-02: 클래스 만들기 (초대코드는 데이터베이스가 자동으로 만든다)
export async function createClass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const semester = String(formData.get("semester") ?? "").trim();
  const room = String(formData.get("room") ?? "").trim();
  const slots = formData
    .getAll("slots")
    .map((value) => String(value).split("-").map(Number))
    .filter(([day, period]) => day >= 1 && day <= 5 && period >= 1 && period <= 7)
    .map(([day, period]) => ({ day, period }));

  if (!name) return { error: "과목명을 입력해 주세요." };
  if (!semester) return { error: "학기를 입력해 주세요." };
  if (slots.length === 0) return { error: "수업 요일·교시를 하나 이상 골라 주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: created, error } = await supabase
    .from("classes")
    .insert({ teacher_id: user.id, name, semester, room: room || null })
    .select("id")
    .single();
  if (error || !created) return { error: "클래스를 만들지 못했어요. 교사 승인 상태를 확인해 주세요." };

  const { error: slotError } = await supabase
    .from("class_slots")
    .insert(slots.map((slot) => ({ ...slot, class_id: created.id })));
  if (slotError) return { error: "수업 시간을 저장하지 못했어요." };

  revalidatePath("/home");
  redirect(`/classes/${created.id}`);
}

// CLS-03: 초대코드로 참여. 시간이 겹치면 경고 문구를 돌려준다.
export type JoinState = ActionState & { classId?: string; conflicts?: string[] };

export async function joinClass(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return { error: "초대코드는 6자리예요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_class", { p_code: code });
  if (error) return { error: error.message };

  const result = data as { class_id: string; conflicts: string[] };
  revalidatePath("/home");
  if (result.conflicts.length > 0) {
    return { classId: result.class_id, conflicts: result.conflicts };
  }
  redirect(`/classes/${result.class_id}`);
}

// 학생이 클래스에서 나가기
export async function leaveClass(classId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("enrollments").delete().eq("class_id", classId).eq("student_id", user.id);
  revalidatePath("/home");
  redirect("/home");
}
