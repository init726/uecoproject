import { requireRole } from "@/lib/auth";
import { JoinClassForm } from "./join-class-form";

export default async function JoinClassPage() {
  await requireRole("student");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <h2 className="text-xl font-bold">클래스 참여</h2>
      <p className="text-sm text-muted-foreground">선생님께 받은 6자리 초대코드를 입력하세요.</p>
      <JoinClassForm />
    </div>
  );
}
