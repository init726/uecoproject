import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { isoToKstLocal } from "@/lib/format";
import { withSchemaFallback } from "@/lib/schema-compat";
import { createClient } from "@/lib/supabase/server";
import type { Assignment } from "@/lib/types";
import { cancelAssignment } from "../actions";
import { AssignmentForm } from "../../../classes/[classId]/assignments/new/assignment-form";

type EditableAssignment = Assignment & { class: { name: string; teacher_id: string } | null };

// 담당 교사만 과제를 고친다. 저장할 때 RLS가 한 번 더 확인한다.
export default async function EditAssignmentPage(props: PageProps<"/assignments/[assignmentId]/edit">) {
  const { assignmentId } = await props.params;
  const { error: cancelError } = await props.searchParams;
  const profile = await requireRole("teacher");
  const supabase = await createClient();

  const { data: assignment, error } = await withSchemaFallback<EditableAssignment>(extended => supabase
    .from("assignments")
    .select(`id, class_id, title, description, rubric, due_at, type, max_chars, allow_late${extended ? ", purpose" : ""}, class:classes(name, teacher_id)`)
    .eq("id", assignmentId)
    .maybeSingle<EditableAssignment>(), ["purpose"]);
  if (error) throw new Error("과제를 불러오지 못했어요.");
  if (!assignment?.class || assignment.class.teacher_id !== profile.id) notFound();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <PageHeader eyebrow={assignment.class.name} title="과제 수정" description="이미 낸 제출물은 그대로 남아요." />
      <AssignmentForm
        classId={assignment.class_id}
        initial={{
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          rubric: assignment.rubric,
          due_at: isoToKstLocal(assignment.due_at),
          type: assignment.type,
          max_chars: assignment.max_chars,
          allow_late: assignment.allow_late,
          self_review: assignment.purpose === "self_review",
        }}
      />

      <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-destructive/40 p-4">
        <h3 className="text-sm font-semibold text-destructive">과제 취소</h3>
        <p className="text-sm text-muted-foreground">
          취소하면 학생 화면과 할 일 목록에서 사라지고 더 이상 제출할 수 없어요. 이미 낸 제출물은 기록으로 보관돼요. 되돌릴 수 없어요.
        </p>
        {typeof cancelError === "string" && <p className="text-sm text-destructive">{cancelError}</p>}
        <form action={cancelAssignment.bind(null, assignment.id, assignment.class_id)}>
          <ConfirmButton variant="destructive" confirm={`'${assignment.title}' 과제를 취소할까요? 되돌릴 수 없어요.`} pendingText="취소하는 중...">
            과제 취소하기
          </ConfirmButton>
        </form>
      </section>
    </div>
  );
}
