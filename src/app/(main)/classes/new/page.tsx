import { requireRole } from "@/lib/auth";
import { CreateClassForm } from "./create-class-form";
import { getSemesters, selectSemester } from "@/lib/semesters";

export default async function NewClassPage() {
  await requireRole("teacher");
  const semesters = await getSemesters();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div><p className="eyebrow">클래스 관리</p><h2 className="page-title">클래스 만들기</h2></div>
      <CreateClassForm semesters={semesters} defaultSemester={selectSemester(semesters)} />
    </div>
  );
}
