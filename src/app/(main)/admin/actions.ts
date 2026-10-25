"use server";

import { revalidatePath } from "next/cache";
import { type Credentials, deleteAccount, issueAccount, resetPassword } from "@/lib/accounts";
import { requireAdmin } from "@/lib/auth";
import { SERVICE_NAME } from "@/lib/constants";
import { normalizePhone, sendSms } from "@/lib/sms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, Role } from "@/lib/types";
import { normalizeUsername, validateUsername } from "@/lib/username";

// 모든 함수가 맨 처음에 requireAdmin()을 부른다. 빼먹으면 누구나 계정을 만들 수 있게 된다.

// AUTH-03: 교사 승인/거절 (데이터베이스 함수가 관리자인지 한 번 더 확인한다)
export async function setTeacherApproval(userId: string, approve: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.rpc("set_teacher_approval", { p_user_id: userId, p_approve: approve });
  revalidatePath("/admin", "layout");
}

export type IssueState = ActionState & { credentials?: Credentials & { role: Role; name: string } };

// 계정 한 개 발급: 임시 비밀번호를 만들어 한 번만 보여준다.
export async function issueAccountAction(_prev: IssueState, formData: FormData): Promise<IssueState> {
  await requireAdmin();

  const roleValue = String(formData.get("role"));
  const role: Role = roleValue === "admin" ? "admin" : roleValue === "teacher" ? "teacher" : "student";
  const name = String(formData.get("name") ?? "").trim();
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const studentNo = String(formData.get("student_no") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();

  if (!name) return { error: "이름을 입력해 주세요." };
  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };
  if (role === "student" && !/^\d{5}$/.test(studentNo)) return { error: "학번은 숫자 5자리예요." };
  if (role === "teacher" && !subject) return { error: "담당 교과를 입력해 주세요." };

  const result = await issueAccount({ role, name, username, studentNo, subject });
  if ("error" in result) return { error: result.error };

  revalidatePath("/admin", "layout");
  return { credentials: { ...result, role, name } };
}

export type BulkRow = { studentNo: string; name: string; username: string; phone: string };
export type BulkResult = {
  studentNo: string;
  name: string;
  username: string;
  password?: string;
  error?: string;
  sms: "sent" | "failed" | "none";
  smsReason?: string;
};

// 학생 단체 발급. 화면이 명단을 20명씩 나눠 여러 번 부른다. (한 번에 오래 걸리지 않도록)
// 전화번호는 문자 보내는 데만 쓰고 저장하지 않는다.
export async function issueStudentBatch(rows: BulkRow[], sendText: boolean): Promise<BulkResult[]> {
  await requireAdmin();
  if (rows.length > 50) throw new Error("한 번에 50명까지 보낼 수 있어요.");

  const results: BulkResult[] = [];
  for (const row of rows) {
    const name = row.name.trim().slice(0, 30);
    const username = normalizeUsername(row.username);
    const base = { studentNo: row.studentNo, name, username, sms: "none" as const };

    const error = !/^\d{5}$/.test(row.studentNo)
      ? "학번은 숫자 5자리예요."
      : !name
        ? "이름이 비어 있어요."
        : validateUsername(username);
    if (error) {
      results.push({ ...base, error });
      continue;
    }

    const issued = await issueAccount({ role: "student", name, username, studentNo: row.studentNo });
    results.push("error" in issued ? { ...base, error: issued.error } : { ...base, password: issued.password });
  }

  if (sendText) {
    const targets = results.flatMap((r, i) => {
      const phone = normalizePhone(rows[i].phone);
      if (!r.password) return [];
      if (!phone) {
        r.smsReason = rows[i].phone ? "번호 형식 오류" : "번호 없음";
        return [];
      }
      return [{ index: i, to: phone, text: `[${SERVICE_NAME}] ${r.name}님\n아이디: ${r.username}\n임시비번: ${r.password}\n첫 로그인 후 변경하세요` }];
    });
    const sent = await sendSms(targets.map(({ to, text }) => ({ to, text })));
    targets.forEach((t, k) => {
      results[t.index].sms = sent[k].ok ? "sent" : "failed";
      results[t.index].smsReason = sent[k].reason;
    });
  }

  revalidatePath("/admin", "layout");
  return results;
}

export type ResetState = ActionState & { password?: string };

export async function resetPasswordAction(userId: string): Promise<ResetState> {
  await requireAdmin();
  const result = await resetPassword(userId);
  if ("error" in result) return { error: result.error };
  return { password: result.password };
}

export async function deleteAccountAction(userId: string): Promise<ActionState> {
  const me = await requireAdmin();
  if (userId === me.id) return { error: "내 계정은 여기서 삭제할 수 없어요." };

  const result = await deleteAccount(userId);
  if (result.error) return { error: result.error };
  revalidatePath("/admin", "layout");
  return { message: "삭제했어요." };
}

export type BulkDeleteResult = { deleted: number; failed: { name: string; reason: string }[] };

// 단체 삭제 (졸업생 정리 등). includeRecords면 학생의 제출 기록·파일도 함께 지운다.
export async function deleteAccountsAction(
  userIds: string[],
  includeRecords: boolean,
): Promise<BulkDeleteResult> {
  const me = await requireAdmin();
  const ids = [...new Set(userIds)].filter((id) => id !== me.id).slice(0, 1000);

  const { data: profiles } = await createAdminClient().from("profiles").select("id, name").in("id", ids);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.name as string]));

  const result: BulkDeleteResult = { deleted: 0, failed: [] };
  for (const id of ids) {
    const { error } = await deleteAccount(id, { includeRecords });
    if (error) result.failed.push({ name: names.get(id) ?? id, reason: error });
    else result.deleted++;
  }

  revalidatePath("/admin", "layout");
  return result;
}
