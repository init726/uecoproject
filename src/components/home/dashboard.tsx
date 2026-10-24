import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, ClipboardList, Plus } from "lucide-react";
import { Timetable, type TimetableClass } from "@/components/timetable";
import { TodayClasses } from "@/components/today-classes";
import { AssignmentRow } from "@/components/assignment-row";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatSlots, isPast, isDueSoon, kstWeekday } from "@/lib/format";
import type { StudentAssignment } from "@/lib/queries";
import type { Profile } from "@/lib/types";

export type StudentDashboardClass = TimetableClass & { semester: string; teacher: { name: string } | null };
export type TeacherDashboardClass = TimetableClass & {
  semester: string;
  import_key: string | null;
  enrollments: { student_id: string }[];
  assignments: { id: string; title: string; due_at: string; class_id: string; submissions: { student_id: string; version: number; canceled_at: string | null }[] }[];
};

function DashboardHeading({ title, description, semesterControl }: { title: string; description: string; semesterControl?: React.ReactNode }) {
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  return <div className="flex flex-col justify-between gap-5 border-b pb-6 sm:flex-row sm:items-end">
    <div><p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><span className="h-px w-5 bg-school-gold" />{date}</p>
      <h2 className="page-title">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p></div>
    {semesterControl && <div className="shrink-0">{semesterControl}</div>}
  </div>;
}

function Stats({ items }: { items: { label: string; value: number; unit: string }[] }) {
  return <dl className={`school-panel grid ${items.length===4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
    {items.map((s,index)=><div key={s.label} className={`min-w-0 px-3 py-4 sm:px-5 sm:py-5 ${index ? "border-l" : ""} ${items.length===4 && index>=2 ? "border-t sm:border-t-0" : ""}`}>
      <dt className="text-[11px] text-muted-foreground sm:text-xs">{s.label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5"><span className="text-2xl font-semibold tabular-nums text-school-navy sm:text-[1.75rem]">{s.value}</span><span className="text-[11px] text-muted-foreground">{s.unit}</span></dd>
    </div>)}
  </dl>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="px-5 py-7"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p></div>;
}

function Courses({ classes, teacher = false }: { classes: (StudentDashboardClass | TeacherDashboardClass)[]; teacher?: boolean }) {
  return <section className="school-panel">
    <div className="school-panel-heading"><h3 className="school-panel-title"><BookOpen className="size-[18px] text-primary" aria-hidden="true" />{teacher ? "담당 수업" : "나의 수업"}<span className="text-sm font-normal text-muted-foreground">{classes.length}</span></h3>
      <Button asChild variant="outline" size="sm"><Link href={teacher ? "/classes/new" : "/classes/join"}><Plus className="size-3.5" />{teacher ? "클래스 만들기" : "클래스 참여"}</Link></Button></div>
    {!classes.length ? <EmptyState title="아직 등록된 수업이 없습니다." detail={teacher ? "새 클래스를 만들거나 학교의 수업 배정을 확인해 주세요." : "학교에서 수업을 배정하거나 선생님의 초대코드로 참여하면 이곳에 표시됩니다."} />
      : <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">{classes.map(c=><Link key={c.id} href={`/classes/${c.id}`}
        className="group flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/20 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
        <div className="flex items-start justify-between gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-card text-primary"><BookOpen className="size-4" aria-hidden="true" /></span>
          <span className="flex items-center gap-2">{"import_key" in c && c.import_key && <span className="rounded border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">학교 배정</span>}<ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden="true" /></span></div>
        <div><h4 className="text-sm font-semibold wrap-break-word group-hover:text-primary">{c.name}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{c.room || "강의실 미지정"}{"teacher" in c && c.teacher ? ` · ${c.teacher.name} 선생님` : "enrollments" in c ? ` · 수강생 ${c.enrollments.length}명` : ""}</p></div>
        <p className="mt-auto border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">{formatSlots(c.class_slots) || "수업 시간 미정"}</p>
      </Link>)}</div>}
  </section>;
}

export function StudentDashboard({ profile, semester, classes, assignments, semesterControl }: {
  profile: Profile; semester: string; classes: StudentDashboardClass[]; assignments: StudentAssignment[]; semesterControl?: React.ReactNode;
}) {
  const todo=assignments.filter(a=>!a.submitted && !(isPast(a.due_at)&&!a.allow_late));
  const urgent=todo.filter(a=>isDueSoon(a.due_at));
  return <div className="flex flex-col gap-6">
    <DashboardHeading title="나의 학교생활" description={`${profile.name} 학생, 오늘도 반갑습니다.`} semesterControl={semesterControl} />
    <Stats items={[{label:"참여 수업",value:classes.length,unit:"개"},{label:"남은 과제",value:todo.length,unit:"개"},{label:"24시간 이내 마감",value:urgent.length,unit:"개"}]} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(17rem,1fr)]">
      <Timetable classes={classes} semester={semester} today={kstWeekday()} />
      <div className="flex min-w-0 flex-col gap-5"><TodayClasses classes={classes} />
        <section className="school-panel"><div className="school-panel-heading"><h3 className="school-panel-title"><ClipboardList className="size-[18px] text-primary" aria-hidden="true" />해야 할 과제<span className="text-sm font-normal text-muted-foreground">{todo.length}</span></h3>
          <Link href="/todo" className="flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-primary">전체 보기<ArrowRight className="size-3.5" aria-hidden="true" /></Link></div>
          {!todo.length ? <EmptyState title="남은 과제가 없습니다." detail="새 과제가 등록되면 이곳에서 확인할 수 있습니다." />
            : <div className="divide-y">{todo.slice(0,4).map(a=><AssignmentRow key={a.id} assignment={a} compact />)}</div>}
        </section>
      </div>
    </div>
    <Courses classes={classes} />
  </div>;
}

export function TeacherDashboard({ profile, semester, classes, semesterControl }: {
  profile: Profile; semester: string; classes: TeacherDashboardClass[]; semesterControl?: React.ReactNode;
}) {
  const assignments=classes.flatMap(c=>c.assignments).sort((a,b)=>b.due_at.localeCompare(a.due_at));
  const recent=assignments.slice(0,5);
  return <div className="flex flex-col gap-6">
    <DashboardHeading title="수업 대시보드" description={`${profile.name} 선생님, 수업과 학생들의 제출 현황을 확인하세요.`} semesterControl={semesterControl} />
    <Stats items={[{label:"담당 수업",value:classes.length,unit:"개"},{label:"수강 학생",value:new Set(classes.flatMap(c=>c.enrollments.map(e=>e.student_id))).size,unit:"명"},
      {label:"진행 중 과제",value:assignments.filter(a=>!isPast(a.due_at)).length,unit:"개"},{label:"학교 배정 수업",value:classes.filter(c=>c.import_key).length,unit:"개"}]} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(17rem,1fr)]">
      <Timetable classes={classes} semester={semester} today={kstWeekday()} />
      <div className="flex min-w-0 flex-col gap-5"><TodayClasses classes={classes} />
        <section className="school-panel"><div className="school-panel-heading"><h3 className="school-panel-title"><ClipboardList className="size-[18px] text-primary" aria-hidden="true" />과제 제출 현황</h3><span className="text-xs text-muted-foreground">최근 과제</span></div>
          {!recent.length ? <EmptyState title="등록된 과제가 없습니다." detail="담당 수업에서 과제를 등록하면 제출 현황을 확인할 수 있습니다." />
            : <div className="divide-y">{recent.map(a=>{
              const c=classes.find(c=>c.id===a.class_id)!;
              const total=c.enrollments.length;
              const latest = new Map<string, (typeof a.submissions)[number]>();
              for (const s of a.submissions) if (!latest.has(s.student_id) || latest.get(s.student_id)!.version < s.version) latest.set(s.student_id, s);
              const done=[...latest.values()].filter(s=>!s.canceled_at).length;
              const rate=total?Math.min(100,Math.round(done/total*100)):0;
              return <Link key={a.id} href={`/assignments/${a.id}`} className="group block p-4 hover:bg-accent/40 sm:p-5">
                <p className="text-[11px] text-muted-foreground">{c.name}</p><p className="mt-1 text-sm font-semibold wrap-break-word group-hover:text-primary">{a.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">마감 {formatDateTime(a.due_at)}</p>
                <div className="mt-3 flex items-center gap-3"><div role="progressbar" aria-label={`${a.title} 제출률`} aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/80" style={{width:`${rate}%`}} /></div><span className="text-[11px] tabular-nums text-muted-foreground">{done}/{total}명</span></div>
              </Link>;
            })}</div>}
        </section>
      </div>
    </div>
    <Courses classes={classes} teacher />
  </div>;
}
