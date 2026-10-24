"use server";

import {isMissingSchema} from "@/lib/schema-compat";
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
      ...(type === "text" && formData.get("self_review") === "on" ? {purpose: "self_review"} : {}),
    })
    .select("id")
    .single();
  if (isMissingSchema(error,["purpose"])) return {error:"자기평가서 기능을 준비 중입니다. 일반 글 과제로 등록해 주세요."};
  if (error || !data) return { error: "과제를 저장하지 못했어요." };

  revalidatePath(`/classes/${classId}`);
  redirect(`/assignments/${data.id}`);
}

export async function deadlineLoad(classId:string,day:string):Promise<{rows?:import("@/components/deadline-load").DeadlineRow[];error?:string}> {
 const {requireRole}=await import("@/lib/auth");await requireRole("teacher");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return {error:"날짜를 선택해 주세요."};
 const client=await createClient();const {data,error}=await client.rpc("class_deadline_load",{p_class_id:classId,p_from:day,p_to:day});
 return error?{error:error.code==="P0001"?error.message:"과제 몰림을 확인하지 못했습니다. DB 업데이트를 확인해 주세요."}:{rows:data};
}
