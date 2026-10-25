import { requireRole } from "@/lib/auth";
import { JoinClassForm } from "./join-class-form";
import { PageHeader } from "@/components/page-header";

export default async function JoinClassPage() {
  await requireRole("student");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <PageHeader eyebrow="클래스" title="클래스 참여" description="선생님께 받은 6자리 초대코드를 입력하세요." />
      <JoinClassForm />
    </div>
  );
}
