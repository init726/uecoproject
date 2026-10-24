import { MissingKey } from "@/components/admin/missing-key";
import { requireAdmin } from "@/lib/auth";
import { smsReady } from "@/lib/sms";
import { hasAdminKey } from "@/lib/supabase/admin";
import { BulkIssueForm } from "./bulk-issue-form";

// 학생 단체 발급: 엑셀 명단을 붙여넣어 한 번에 계정을 만든다. (새 학년 시작할 때)
export default async function BulkIssuePage() {
  await requireAdmin();
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-mono text-xl font-bold">학생 단체 발급</h2>
        <p className="text-sm text-muted-foreground">
          엑셀에서 학번·이름·전화번호 열을 복사해 붙여넣으세요. 아이디 열이 없으면 &quot;발급 연도+학번&quot;으로 만들어요.
          학생은 첫 로그인 때 비밀번호를 바꾸고, 원하면 아이디도 바꿀 수 있어요.
        </p>
      </div>
      {hasAdminKey() ? <BulkIssueForm defaultYear={year} smsReady={smsReady()} /> : <MissingKey />}
    </div>
  );
}
