import { redirect } from "next/navigation";
import { logout } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

// 승인 대기 중인 교사가 보는 화면 (getProfile을 쓰면 이 페이지로 다시 보내져 무한 반복되므로 직접 확인)
export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, approved")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "teacher" || profile.approved) redirect("/home");

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>승인을 기다리고 있어요</CardTitle>
          <CardDescription>
            {profile.name} 선생님, 관리자가 교사 계정을 승인하면 클래스를 만들 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logout}>
            <SubmitButton variant="outline" className="w-full" pendingText="로그아웃 중...">
              로그아웃
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
