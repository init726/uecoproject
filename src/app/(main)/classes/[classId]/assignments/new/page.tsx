import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { kstYear } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AssignmentForm } from "./assignment-form";
import { PageHeader } from "@/components/page-header";

export default async function NewAssignmentPage(
  props: PageProps<"/classes/[classId]/assignments/new">,
) {
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
      <PageHeader eyebrow={klass.name} title="과제 내기" />
      <AssignmentForm classId={classId} year={kstYear()} />
    </div>
  );
}
