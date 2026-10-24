import Link from "next/link";
import { AssignmentRow } from "@/components/assignment-row";
import { Timetable, type TimetableClass } from "@/components/timetable";
import { TodayClasses } from "@/components/today-classes";
import { Button } from "@/components/ui/button";
import { formatSlots, isPast } from "@/lib/format";
import { getStudentAssignments } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type HomeClass = TimetableClass & { semester: string; teacher: { name: string } | null };

// 학생 홈: 오늘 수업 → 해야 할 과제 → 시간표 → 참여한 수업
export async function StudentHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const [{ data }, assignments] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, room, semester, class_slots(day, period), teacher:profiles!classes_teacher_id_fkey(name)")
      .order("name")
      .overrideTypes<HomeClass[], { merge: false }>(),
    getStudentAssignments(supabase),
  ]);
  const classes = data ?? [];
  const todo = assignments.filter((a) => !a.submitted && !(isPast(a.due_at) && !a.allow_late));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">안녕하세요</p>
        <h2 className="text-2xl font-bold">{profile.name}님</h2>
      </div>

      <TodayClasses classes={classes} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            해야 할 과제 <span className="text-primary">{todo.length}</span>
          </h3>
          <Link href="/todo" className="text-sm text-muted-foreground hover:text-foreground">
            전체 보기
          </Link>
        </div>
        {todo.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">
            밀린 과제가 없어요.
          </p>
        ) : (
          todo.slice(0, 3).map((a) => <AssignmentRow key={a.id} assignment={a} />)
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">내 시간표</h3>
        <div className="bg-background">
          <Timetable classes={classes} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">참여한 수업 {classes.length}</h3>
          <Button asChild size="sm">
            <Link href="/classes/join">+ 클래스 참여</Link>
          </Button>
        </div>
        {classes.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
            아직 참여한 수업이 없어요. 선생님께 받은 초대코드를 입력해 보세요.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {classes.map((c) => (
              <Link
                key={c.id}
                href={`/classes/${c.id}`}
                className="rounded-xl border bg-background p-3 hover:border-primary"
              >
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[formatSlots(c.class_slots), c.room, c.teacher && `${c.teacher.name} 선생님`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
