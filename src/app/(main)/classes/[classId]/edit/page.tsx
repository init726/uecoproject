import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getSemesters, selectSemester } from "@/lib/semesters";
import { createClient } from "@/lib/supabase/server";
import type { ClassRow, ClassSlot } from "@/lib/types";
import { CreateClassForm } from "../../new/create-class-form";

export default async function EditClassPage(props: PageProps<"/classes/[classId]/edit">) {
  const profile = await requireRole("teacher");
  const { classId } = await props.params;
  const supabase = await createClient();
  const [{ data: klass, error }, semesters] = await Promise.all([
    supabase.from("classes").select("id, teacher_id, name, semester, room, invite_code, class_slots(day, period)")
      .eq("id", classId).eq("teacher_id", profile.id).maybeSingle<ClassRow & { class_slots: ClassSlot[] }>(),
    getSemesters(),
  ]);
  if (error) throw new Error("클래스 정보를 불러오지 못했어요.");
  if (!klass) notFound();
  return <div className="mx-auto flex max-w-xl flex-col gap-6">
    <div><p className="eyebrow">클래스 관리</p><h2 className="page-title">클래스 수정</h2></div>
    <CreateClassForm semesters={semesters} defaultSemester={selectSemester(semesters)} initial={klass} />
  </div>;
}
