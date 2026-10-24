"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";
import { requireRole } from "@/lib/auth";

export type ClassFormState = ActionState & { conflicts?: string[] };

// CLS-01, CLS-02: 클래스 만들기 (초대코드는 데이터베이스가 자동으로 만든다)
export async function createClass(_prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  return saveClass(null, formData);
}

export async function updateClass(classId: string, _prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  return saveClass(classId, formData);
}

async function saveClass(classId: string | null, formData: FormData): Promise<ClassFormState> {
  await requireRole("teacher");
  const name = String(formData.get("name") ?? "").trim();
  const semester = String(formData.get("semester") ?? "").trim();
  const room = String(formData.get("room") ?? "").trim();
  const rawSlots = [...new Set(formData.getAll("slots").map(String))];
  if (rawSlots.some((value) => !/^[1-5]-[1-7]$/.test(value))) return { error: "수업 시간을 다시 선택해 주세요." };
  const slots = rawSlots.map((value) => {
    const [day, period] = value.split("-").map(Number);
    return { day, period };
  });

  if (!name) return { error: "과목명을 입력해 주세요." };
  if (!semester) return { error: "학기를 입력해 주세요." };
  if (slots.length === 0) return { error: "수업 요일·교시를 하나 이상 골라 주세요." };
  if (name.length > 50 || room.length > 30 || semester.length > 30) return { error: "입력한 내용이 너무 길어요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_class", {
    p_name: name, p_semester: semester, p_room: room, p_slots: slots,
    p_class_id: classId, p_allow_conflicts: formData.get("allow_conflicts") === "on",
  });
  if (error) return { error: error.code === "P0001" ? error.message : "클래스를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  const result = data as { class_id: string | null; conflicts: string[] };
  if (!result.class_id) return { conflicts: result.conflicts };

  revalidatePath("/home");
  revalidatePath("/todo");
  revalidatePath("/", "layout");
  redirect(`/classes/${result.class_id}`);
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
