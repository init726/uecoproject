import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

// 로그인 정보(토큰)를 서버 안에서 바로 검증한다. getUser()처럼 매번 Supabase에 묻지 않아 빠르다.
// cache(): 한 번의 요청 안에서 레이아웃과 페이지가 여러 번 불러도 실제로는 한 번만 실행된다.
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  return {
    id: claims.sub,
    email: claims.email ?? "",
    mustChangePassword: Boolean(claims.app_metadata?.must_change_password),
  };
});

// 로그인한 사용자의 프로필을 가져온다. 로그인하지 않았으면 /login으로 보낸다.
// 임시 비밀번호로 처음 로그인했으면 /welcome으로, 승인 대기 중인 교사는 /pending으로 보낸다.
export const getProfile = cache(async (): Promise<Profile> => {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/welcome");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role, student_no, subject, approved")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) redirect("/login");

  if (profile.role === "teacher" && !profile.approved) redirect("/pending");
  return profile;
});

// 특정 역할만 들어올 수 있는 페이지에서 쓴다.
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!roles.includes(profile.role)) redirect("/home");
  return profile;
}

// 관리자 페이지와 관리자 서버 액션 맨 위에서 반드시 호출한다.
// (서버 액션은 주소만 알면 누구나 부를 수 있으므로 화면에서 숨기는 것으로는 부족하다)
export async function requireAdmin(): Promise<Profile> {
  return requireRole("admin");
}
