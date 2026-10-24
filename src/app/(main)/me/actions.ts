"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changeUsername } from "@/lib/accounts";
import { hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";
import { normalizeUsername, validateUsername } from "@/lib/username";

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 해요." };
  if (password !== confirm) return { error: "두 비밀번호가 서로 달라요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "지금 비밀번호와 다른 비밀번호를 써 주세요." };
    if (error.code === "weak_password") return { error: "더 복잡한 비밀번호를 써 주세요." };
    return { error: "비밀번호를 바꾸지 못했어요." };
  }
  return { message: "비밀번호를 바꿨어요." };
}

// 아이디 바꾸기. 다음 로그인부터 새 아이디를 쓴다.
export async function changeMyUsername(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };
  if (!hasAdminKey()) return { error: "지금은 아이디를 바꿀 수 없어요. 관리자에게 문의해 주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await changeUsername(user.id, username);
  if (result.error) return { error: result.error };

  await supabase.auth.refreshSession(); // 토큰 안의 아이디(이메일)도 새것으로
  revalidatePath("/me");
  return { message: `아이디를 ${username}(으)로 바꿨어요. 다음 로그인부터 새 아이디를 쓰세요.` };
}
