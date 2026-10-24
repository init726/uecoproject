"use server";

import { redirect } from "next/navigation";
import { changeUsername, clearMustChangePassword } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";
import { normalizeUsername, validateUsername } from "@/lib/username";

// 임시 비밀번호로 처음 로그인했을 때: 새 비밀번호(필수)와 새 아이디(선택)를 정한다.
export async function completeFirstLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const newUsername = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 해요." };
  if (password !== confirm) return { error: "두 비밀번호가 서로 달라요." };
  if (newUsername) {
    const usernameError = validateUsername(newUsername);
    if (usernameError) return { error: usernameError };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (newUsername) {
    const result = await changeUsername(user.id, newUsername);
    if (result.error) return { error: result.error };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "임시 비밀번호와 다른 비밀번호를 써 주세요." };
    if (error.code === "weak_password") return { error: "더 복잡한 비밀번호를 써 주세요." };
    return { error: "비밀번호를 바꾸지 못했어요." };
  }

  await clearMustChangePassword(user.id);
  // 로그인 토큰에는 "비밀번호 바꿔야 함" 표시가 아직 남아 있으므로 새 토큰을 받는다.
  await supabase.auth.refreshSession();
  redirect("/home");
}
