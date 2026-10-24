import "server-only";
import { generatePassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";
import { toAuthEmail } from "@/lib/username";

// 관리자가 계정을 발급·초기화·삭제할 때 쓰는 함수들.
// 부르기 전에 반드시 requireAdmin()으로 관리자인지 확인해야 한다.
// (교사 회원가입의 createTeacherSignup만 예외: 승인 전 상태로만 만든다)

// app_metadata는 secret key로만 바꿀 수 있어서 사용자가 스스로 지울 수 없다.
// must_change_password가 true면 로그인 직후 /welcome에서 비밀번호를 바꿔야 한다.
const MUST_CHANGE = { must_change_password: true };

export type IssueInput = {
  role: Role;
  name: string;
  username: string;
  studentNo?: string;
  subject?: string;
};

export type Credentials = { username: string; password: string };

function describeCreateError(code: string | undefined) {
  if (code === "email_exists" || code === "user_already_exists") return "이미 사용 중인 아이디예요.";
  return "계정을 만들지 못했어요.";
}

export async function issueAccount(input: IssueInput): Promise<Credentials | { error: string }> {
  const admin = createAdminClient();
  const password = generatePassword();

  // 가입 트리거는 student/teacher만 받으므로, 관리자는 teacher로 만든 뒤 바로 역할을 바꾼다.
  const { data, error } = await admin.auth.admin.createUser({
    email: toAuthEmail(input.username),
    password,
    email_confirm: true,
    app_metadata: MUST_CHANGE,
    user_metadata: {
      name: input.name,
      role: input.role === "student" ? "student" : "teacher",
      student_no: input.studentNo ?? "",
      subject: input.subject ?? "",
      privacy_agreed: "true",
    },
  });
  if (error || !data.user) return { error: describeCreateError(error?.code) };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: input.role, approved: true })
    .eq("id", data.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id); // 반쯤 만들어진 계정은 지운다.
    return { error: "계정 정보를 저장하지 못했어요." };
  }

  return { username: input.username, password };
}

// 교사 회원가입: 비밀번호는 본인이 정하고, 관리자 승인 전(approved=false) 상태로 만든다.
export async function createTeacherSignup(input: {
  name: string;
  username: string;
  subject: string;
  password: string;
}): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: toAuthEmail(input.username),
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name, role: "teacher", subject: input.subject, privacy_agreed: "true" },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "더 복잡한 비밀번호를 써 주세요." };
    return { error: describeCreateError(error.code) };
  }
  return {};
}

export async function resetPassword(userId: string): Promise<{ password: string } | { error: string }> {
  const admin = createAdminClient();
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password, app_metadata: MUST_CHANGE });
  if (error) return { error: "비밀번호를 초기화하지 못했어요." };
  return { password };
}

export async function clearMustChangePassword(userId: string) {
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { app_metadata: { must_change_password: false } });
}

// 아이디가 이미 쓰이는지 확인한다. (Supabase는 이메일 중복으로 수정을 막을 때 구분 가능한 오류를 주지 않는다)
async function isUsernameTaken(username: string) {
  const admin = createAdminClient();
  const email = toAuthEmail(username);
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return false;
    if (data.users.some((u) => u.email === email)) return true;
    if (data.users.length < 1000) return false;
  }
}

export async function changeUsername(userId: string, username: string): Promise<{ error?: string }> {
  if (await isUsernameTaken(username)) return { error: "이미 사용 중인 아이디예요." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: toAuthEmail(username),
    email_confirm: true,
  });
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      return { error: "이미 사용 중인 아이디예요." };
    }
    return { error: "아이디를 바꾸지 못했어요." };
  }
  return {};
}

// includeRecords=false: 수업이나 제출 기록이 있으면 지우지 않는다. (기록 보존)
// includeRecords=true: 학생의 제출 기록과 파일까지 함께 지운다. (졸업생 정리용)
// 클래스가 있는 교사는 어느 경우에도 지우지 않는다. (학생들의 기록이 딸려 있으므로)
export async function deleteAccount(
  userId: string,
  { includeRecords = false } = {},
): Promise<{ error?: string }> {
  const admin = createAdminClient();

  const { count: classCount } = await admin
    .from("classes")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", userId);
  if (classCount) return { error: `클래스가 ${classCount}개 있는 교사는 삭제할 수 없어요.` };

  const { data: submissions } = await admin
    .from("submissions")
    .select("id, file_path")
    .eq("student_id", userId);
  if (submissions?.length) {
    if (!includeRecords) return { error: "제출 기록이 있는 학생은 삭제할 수 없어요." };

    const files = submissions.map((s) => s.file_path).filter((p): p is string => Boolean(p));
    for (let i = 0; i < files.length; i += 100) {
      await admin.storage.from("submissions").remove(files.slice(i, i + 100));
    }
    const { error } = await admin.from("submissions").delete().eq("student_id", userId);
    if (error) return { error: "제출 기록을 지우지 못했어요." };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: "계정을 삭제하지 못했어요." };
  return {};
}
