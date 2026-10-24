import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NoticeForm } from "./notice-form";

export default async function NewNoticePage(props: PageProps<"/classes/[classId]/notices/new">) {
  const { classId } = await props.params;
  const profile = await requireRole("teacher");

  const supabase = await createClient();
  const { data: klass } = await supabase
    .from("classes")
    .select("name, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!klass || klass.teacher_id !== profile.id) notFound();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h2 className="text-xl font-bold">공지 쓰기 · {klass.name}</h2>
      <NoticeForm classId={classId} />
    </div>
  );
}
