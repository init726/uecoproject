import { logout } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthUser, getProfile } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { displayLoginId } from "@/lib/username";
import { PasswordForm } from "./password-form";
import { UsernameForm } from "./username-form";
import { PageHeader } from "@/components/page-header";

export default async function MePage() {
  const [profile, user] = await Promise.all([getProfile(), getAuthUser()]);
  const loginId = displayLoginId(user?.email);

  const rows = [
    ["계정 종류", ROLE_LABEL[profile.role]],
    ["이름", profile.name],
    ["아이디", loginId],
    profile.role === "student" ? ["학번", profile.student_no] : null,
    profile.role === "teacher" ? ["담당 교과", profile.subject] : null,
  ].filter((row): row is [string, string] => Boolean(row));

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <PageHeader eyebrow="계정" title="내 정보" />
      <Card>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>아이디 바꾸기</CardTitle>
        </CardHeader>
        <CardContent>
          <UsernameForm currentId={loginId} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>비밀번호 바꾸기</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
      <form action={logout}>
        <SubmitButton variant="outline" className="w-full" pendingText="로그아웃 중...">
          로그아웃
        </SubmitButton>
      </form>
    </div>
  );
}
