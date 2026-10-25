"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { CalendarDays } from "lucide-react";
import { DAYS, PERIODS } from "@/lib/constants";
import type { ClassSlot } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TimetableClass = { id: string; name: string; room: string | null; class_slots: ClassSlot[] };
// 수업마다 색 하나. 실제 색 값은 globals.css 의 --timetable-1~5 (라이트·다크 따로)
const COLORS = [
  "timetable-cell [--tt:var(--timetable-1)]",
  "timetable-cell [--tt:var(--timetable-2)]",
  "timetable-cell [--tt:var(--timetable-3)]",
  "timetable-cell [--tt:var(--timetable-4)]",
  "timetable-cell [--tt:var(--timetable-5)]",
];
function classColor(id: string) {
  return COLORS[[...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % COLORS.length];
}

export function Timetable({ classes, semester, today = null }: { classes: TimetableClass[]; semester?: string; today?: number | null }) {
  const [view, setView] = useState<"day" | "week">("day");
  const [selectedDay, setSelectedDay] = useState(today ?? 1);
  const titleId = useId();
  const cells = new Map<string, TimetableClass[]>();
  for (const c of classes) for (const slot of c.class_slots) {
    const key = `${slot.day}-${slot.period}`;
    cells.set(key, [...(cells.get(key) ?? []), c]);
  }
  const conflictCount = [...cells.values()].filter((cell) => cell.length > 1).length;
  const hasDayClasses = PERIODS.some((period) => cells.has(`${selectedDay}-${period}`));
  return <section className="school-panel" aria-labelledby={titleId}>
    <div className="school-panel-heading">
      <div><h3 id={titleId} className="school-panel-title"><CalendarDays className="size-[18px] text-primary" aria-hidden="true" />주간 시간표</h3>
        <p className="mt-1 text-xs text-muted-foreground">{semester ? `${semester} · ` : ""}월–금, 1–7교시</p></div>
      <div role="group" aria-label="시간표 보기 방식" className="flex rounded-lg border bg-muted p-0.5 sm:hidden">
        {([['day','요일별'],['week','주간']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={view===value}
          onClick={() => setView(value)} className={cn("min-h-9 rounded-md px-3 text-xs font-medium",view===value ? "bg-card font-bold text-foreground ring-1 ring-border" : "text-muted-foreground")}>{label}</button>)}
      </div>
      <span className="hidden text-xs text-muted-foreground sm:block">수업을 선택하면 클래스로 이동합니다</span>
    </div>

    <div className={cn("sm:hidden",view==='week'&&"hidden")}>
      <div role="group" aria-label="요일 선택" className="grid grid-cols-5 gap-1 border-b px-3 py-3">
        {DAYS.map((day,index) => <button type="button" key={day} aria-pressed={selectedDay===index+1}
          onClick={() => setSelectedDay(index+1)} className={cn("flex min-h-11 items-center justify-center gap-1 rounded-lg text-sm font-medium",selectedDay===index+1?"bg-school-navy text-white":"text-muted-foreground hover:bg-muted")}>
          {day}<span className={cn("size-1 rounded-full",today===index+1 ? "bg-school-gold" : "bg-transparent")} aria-hidden="true" />
        </button>)}
      </div>
      <p className="sr-only" role="status">{DAYS[selectedDay-1]}요일 시간표</p>
      {!hasDayClasses ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">{DAYS[selectedDay-1]}요일에는 등록된 수업이 없습니다.</p>
        : <div className="divide-y px-4">{PERIODS.map((period) => {
          const here=cells.get(`${selectedDay}-${period}`)??[];
          return <div key={period} className="flex min-h-[4.5rem] items-stretch gap-3 py-2.5">
            <div className="flex w-8 shrink-0 flex-col justify-center text-center"><span className="text-base font-semibold tabular-nums text-school-navy">{period}</span><span className="text-[10px] text-muted-foreground">교시</span></div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">{here.length ? here.map(c => <Link key={c.id} href={`/classes/${c.id}`}
              aria-label={`${DAYS[selectedDay-1]}요일 ${period}교시 ${c.name}`}
              className={cn("flex min-h-12 flex-1 flex-wrap items-center justify-between gap-1 rounded-md border-l-[3px] px-3 py-2",here.length>1?"timetable-cell [--tt:var(--destructive)]":classColor(c.id))}>
              <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{c.name}</span>
              <span className="text-xs opacity-80">{here.length>1?"시간 겹침":c.room}</span>
            </Link>) : <span className="flex h-full min-h-12 items-center px-3 text-xs text-muted-foreground/70">등록된 수업 없음</span>}</div>
          </div>;
        })}</div>}
    </div>

    <div className={cn(view==='day'&&"hidden sm:block")}>
      <table className="w-full table-fixed border-collapse text-center text-[11px] sm:text-xs">
        <caption className="sr-only">월요일부터 금요일까지 1~7교시 시간표</caption>
        <thead><tr className="border-b bg-muted/70">
          <th className="w-8 py-3 text-[10px] font-medium text-muted-foreground sm:w-10">교시</th>
          {DAYS.map((day,index)=><th key={day} scope="col" className={cn("py-3 font-semibold",today===index+1&&"bg-accent text-primary")}>{day}<span className="sr-only">요일</span>{today===index+1&&<span className="mx-auto mt-1 block size-1 rounded-full bg-primary" />}</th>)}
        </tr></thead>
        <tbody>{PERIODS.map(period=><tr key={period} className="border-b last:border-b-0">
          <th scope="row" className="bg-muted/40 font-medium text-muted-foreground">{period}</th>
          {DAYS.map((day,index)=>{
            const here=cells.get(`${index+1}-${period}`)??[];
            return <td key={day} className={cn("h-[4.75rem] border-l p-0.5 align-top sm:h-20 sm:p-1",today===index+1&&"bg-accent/20")}>
              {here.map(c=><Link key={c.id} href={`/classes/${c.id}`} aria-label={`${day}요일 ${period}교시 ${c.name}`}
                className={cn("mb-0.5 block rounded-md border-l-2 px-1 py-2 text-left leading-snug transition-opacity hover:opacity-75 sm:px-2",here.length>1?"timetable-cell [--tt:var(--destructive)]":classColor(c.id))}>
                {here.length>1&&<span className="mb-0.5 block text-[10px] font-medium text-destructive">시간 겹침</span>}
                <span className="block font-semibold [overflow-wrap:anywhere]">{c.name}</span>
                {c.room&&<span className="mt-1 block text-[10px] opacity-80 [overflow-wrap:anywhere]">{c.room}</span>}
              </Link>)}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      {!classes.length&&<p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">선택한 학기에 등록된 수업이 없습니다.</p>}
    </div>
    {conflictCount>0&&<p className="border-t px-4 py-3 text-xs text-destructive">시간이 겹치는 칸이 {conflictCount}개 있습니다. 담당 선생님께 확인해 주세요.</p>}
  </section>;
}
