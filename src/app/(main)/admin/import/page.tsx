import { requireAdmin } from "@/lib/auth";
import { hasAdminKey } from "@/lib/supabase/admin";
import { MissingKey } from "@/components/admin/missing-key";
import { SchoolImportForm } from "./import-form";

export default async function ImportPage() {
  await requireAdmin();
  return <div className="flex flex-col gap-6">
    <div><p className="eyebrow">학교 데이터 등록</p><h2 className="page-title">엑셀 계정·시간표 등록</h2>
      <p className="mt-2 text-sm text-muted-foreground">학생·교사 계정을 연결하고, 공통·선택과목에 따라 개인 시간표를 구성합니다. 파일 검토 단계에서는 데이터를 변경하지 않습니다.</p>
    </div>
    {hasAdminKey() ? <SchoolImportForm /> : <MissingKey />}
  </div>;
}
