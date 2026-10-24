import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { displayLoginId } from "@/lib/username";
import { WelcomeForm } from "./welcome-form";

// 발급받은 임시 비밀번호로 처음 로그인하면 여기로 온다. 비밀번호를 바꾸기 전에는 다른 화면을 쓸 수 없다.
// (getProfile을 쓰면 다시 이 페이지로 보내져 무한 반복되므로 직접 확인한다)
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.app_metadata?.must_change_password) redirect("/home");

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();

  return (
    <main id="main-content" className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{profile?.name ?? ""}님, 환영해요</CardTitle>
          <CardDescription>
            지금은 학교에서 받은 임시 비밀번호예요. 나만 아는 비밀번호로 바꿔야 시작할 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WelcomeForm currentId={displayLoginId(user.email)} />
        </CardContent>
      </Card>
    </main>
  );
}
