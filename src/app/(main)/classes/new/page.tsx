import { requireRole } from "@/lib/auth";
import { CreateClassForm } from "./create-class-form";

export default async function NewClassPage() {
  await requireRole("teacher");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h2 className="text-xl font-bold">클래스 만들기</h2>
      <CreateClassForm />
    </div>
  );
}
