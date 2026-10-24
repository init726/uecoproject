"use server";

import { redirect } from "next/navigation";
import { createTeacherSignup } from "@/lib/accounts";
import { hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";
import { normalizeUsername, toAuthEmail, validateUsername } from "@/lib/username";

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const loginId = String(formData.get("login_id") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: toAuthEmail(loginId), password });
  if (error) return { error: "아이디 또는 비밀번호가 맞지 않아요." };
  redirect("/home");
}

// 회원가입은 교사만. 학생 계정은 학교(관리자)가 단체로 발급한다.
export async function signupTeacher(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "이름을 입력해 주세요." };
  if (!subject) return { error: "담당 교과를 입력해 주세요." };
  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 해요." };
  if (formData.get("privacy") !== "on") {
    return { error: "개인정보 수집·이용에 동의해야 가입할 수 있어요." };
  }
  if (!hasAdminKey()) return { error: "지금은 가입할 수 없어요. 관리자에게 문의해 주세요." };

  const result = await createTeacherSignup({ name, username, subject, password });
  if (result.error) return { error: result.error };

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: toAuthEmail(username), password });
  redirect("/pending");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
