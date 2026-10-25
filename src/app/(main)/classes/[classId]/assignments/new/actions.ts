"use server";

import {isMissingSchema} from "@/lib/schema-compat";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { kstLocalToIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

// 만들기·고치기가 같이 쓰는 입력 확인. type 은 만들 때 폼에서, 고칠 때는 원래 과제의 값을 받는다.
function readAssignmentFields(formData: FormData, type: "file" | "text") {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rubric = String(formData.get("rubric") ?? "").trim();
  const dueAt = kstLocalToIso(String(formData.get("due_at") ?? ""));
  const maxChars = Number(formData.get("max_chars") ?? 0);
  const allowLate = formData.get("allow_late") === "on";

  if (!title) return { error: "제목을 입력해 주세요." } as const;
  if (!dueAt) return { error: "마감 일시를 입력해 주세요." } as const;
  if (type === "text" && !(maxChars >= 50 && maxChars <= 10000)) {
    return { error: "글자 수 제한은 50~10000자 사이로 정해 주세요." } as const;
  }
  return {
    fields: { title, description, rubric, due_at: dueAt, max_chars: type === "text" ? maxChars : null, allow_late: allowLate },
  } as const;
}

// ASG-01: 과제 만들기. 파일 제출과 글 작성(수행평가·활동 기록 등)을 type 하나로 구분한다.
export async function createAssignment(
  classId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const type = formData.get("type") === "text" ? "text" : "file";
  const read = readAssignmentFields(formData, type);
  if ("error" in read) return { error: read.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      class_id: classId,
      type,
      ...read.fields,
      ...(type === "text" && formData.get("self_review") === "on" ? {purpose: "self_review"} : {}),
    })
    .select("id")
    .single();
  if (isMissingSchema(error,["purpose"])) return {error:"자기평가서 기능을 준비 중입니다. 일반 글 과제로 등록해 주세요."};
  if (error || !data) return { error: "과제를 저장하지 못했어요." };

  revalidatePath(`/classes/${classId}`);
  redirect(`/assignments/${data.id}`);
}

// 과제 고치기: 제목·설명·평가 기준·마감·글자 수·마감 후 제출 허용만 바꾼다.
// 제출 방식(파일/글)과 자기평가서 여부는 이미 낸 제출물과 맞지 않게 되므로 바꾸지 않는다.
// 담당 교사인지는 RLS("assignments: 담당 교사만 수정")가 확인한다. 아니면 0행이 바뀐다.
export async function updateAssignment(
  assignmentId: string,
  type: "file" | "text",
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const read = readAssignmentFields(formData, type);
  if ("error" in read) return { error: read.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .update(read.fields)
    .eq("id", assignmentId)
    .select("id, class_id");
  if (error) return { error: "과제를 저장하지 못했어요." };
  if (!data?.length) return { error: "고칠 수 없는 과제예요." };

  revalidatePath(`/classes/${data[0].class_id}`);
  revalidatePath(`/assignments/${assignmentId}`);
  redirect(`/assignments/${assignmentId}`);
}

export async function deadlineLoad(classId:string,day:string):Promise<{rows?:import("@/components/deadline-load").DeadlineRow[];error?:string}> {
 const {requireRole}=await import("@/lib/auth");await requireRole("teacher");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return {error:"날짜를 선택해 주세요."};
 const client=await createClient();const {data,error}=await client.rpc("class_deadline_load",{p_class_id:classId,p_from:day,p_to:day});
 if(isMissingSchema(error,["class_deadline_load"])) return {error:"과제 몰림 확인은 DB 업데이트(update-school-workflows.sql → update-assignment-tools.sql) 뒤에 쓸 수 있어요."};
 return error?{error:error.code==="P0001"?error.message:"과제 몰림을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."}:{rows:data};
}
