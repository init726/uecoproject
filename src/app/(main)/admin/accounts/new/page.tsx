import { MissingKey } from "@/components/admin/missing-key";
import { requireAdmin } from "@/lib/auth";
import { hasAdminKey } from "@/lib/supabase/admin";
import { IssueForm } from "./issue-form";

// 계정 발급: 관리자 및 개발자 계정은 회원가입이 없고 여기서만 만들 수 있다.
export default async function IssueAccountPage() {
  await requireAdmin();

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="font-mono text-xl font-bold">계정 발급</h2>
        <p className="text-sm text-muted-foreground">
          발급한 계정은 승인·이메일 인증 없이 바로 로그인할 수 있어요. 임시 비밀번호는 한 번만 보여줘요.
        </p>
      </div>
      {hasAdminKey() ? <IssueForm /> : <MissingKey />}
    </div>
  );
}
