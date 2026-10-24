import { AssignmentRow } from "@/components/assignment-row";
import { requireRole } from "@/lib/auth";
import { isPast } from "@/lib/format";
import { getStudentAssignments } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

// 학생 전용: 모든 수업의 과제를 한눈에
export default async function TodoPage() {
  await requireRole("student");
  const supabase = await createClient();
  const assignments = await getStudentAssignments(supabase);

  const missed = assignments.filter((a) => !a.submitted && isPast(a.due_at));
  const upcoming = assignments.filter((a) => !a.submitted && !isPast(a.due_at));
  const done = assignments.filter((a) => a.submitted).reverse();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold">할 일</h2>
      <Group title="해야 할 과제" items={upcoming} empty="남은 과제가 없어요." />
      {missed.length > 0 && <Group title="마감 지난 과제" items={missed} />}
      <Group title="제출한 과제" items={done} empty="아직 제출한 과제가 없어요." />
    </div>
  );
}

function Group({
  title,
  items,
  empty,
}: {
  title: string;
  items: Awaited<ReturnType<typeof getStudentAssignments>>;
  empty?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">
        {title} <span className="text-primary">{items.length}</span>
      </h3>
      {items.length === 0 && empty ? (
        <p className="rounded-xl border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        items.map((a) => <AssignmentRow key={a.id} assignment={a} />)
      )}
    </section>
  );
}
