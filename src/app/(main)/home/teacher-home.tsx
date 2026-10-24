import Link from "next/link";
import { Timetable, type TimetableClass } from "@/components/timetable";
import { TodayClasses } from "@/components/today-classes";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatSlots, isPast } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type TeacherClass = TimetableClass & {
  semester: string;
  enrollments: { student_id: string }[];
  assignments: { id: string; title: string; due_at: string; class_id: string; submissions: { student_id: string }[] }[];
};

// 교사 대시보드: 숫자 요약 → 오늘 수업 → 최근 과제 제출률 → 시간표 → 클래스
export async function TeacherHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();

  // 클래스·수강생·과제·제출을 한 번의 요청으로 가져온다. (여러 번 왕복하지 않도록)
  const { data } = await supabase
    .from("classes")
    .select(
      "id, name, room, semester, class_slots(day, period), enrollments(student_id), assignments(id, title, due_at, class_id, submissions(student_id))",
    )
    .eq("teacher_id", profile.id)
    .order("name")
    .overrideTypes<TeacherClass[], { merge: false }>();
  const classes = data ?? [];

  const assignments = classes
    .flatMap((c) => c.assignments)
    .sort((a, b) => b.due_at.localeCompare(a.due_at));
  const recent = assignments.slice(0, 5);
  const membersByClass = new Map(classes.map((c) => [c.id, c.enrollments.length]));
  const submittedCount = (a: TeacherClass["assignments"][number]) =>
    new Set(a.submissions.map((s) => s.student_id)).size;
  const classNames = new Map(classes.map((c) => [c.id, c.name]));

  const stats = [
    { label: "내 클래스", value: classes.length },
    { label: "가르치는 학생", value: new Set(classes.flatMap((c) => c.enrollments.map((e) => e.student_id))).size },
    { label: "진행 중 과제", value: assignments.filter((a) => !isPast(a.due_at)).length },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">대시보드</p>
          <h2 className="text-2xl font-bold">{profile.name} 선생님</h2>
        </div>
        <Button asChild>
          <Link href="/classes/new">+ 클래스 만들기</Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-3xl font-bold text-primary">{s.value}</p>
          </div>
        ))}
      </div>

      <TodayClasses classes={classes} />

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">최근 과제 제출 현황</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 낸 과제가 없어요.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {recent.map((a) => {
              const total = membersByClass.get(a.class_id) ?? 0;
              const done = submittedCount(a);
              const rate = total ? Math.round((done / total) * 100) : 0;
              return (
                <Link
                  key={a.id}
                  href={`/assignments/${a.id}`}
                  className="flex items-center gap-4 p-3 hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {classNames.get(a.class_id)} · 마감 {formatDateTime(a.due_at)}
                    </p>
                  </div>
                  <div className="flex w-32 shrink-0 flex-col gap-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {done}/{total}명 제출
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">내 수업 시간표</h3>
        <Timetable classes={classes} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">내 클래스</h3>
        {classes.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            아직 만든 클래스가 없어요. 클래스를 만들고 학생들에게 초대코드를 알려주세요.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => (
              <Link key={c.id} href={`/classes/${c.id}`} className="rounded-xl border p-4 hover:border-primary">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[c.semester, formatSlots(c.class_slots), c.room].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-2 text-sm">학생 {membersByClass.get(c.id) ?? 0}명</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
