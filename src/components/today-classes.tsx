import Link from "next/link";
import { DAYS } from "@/lib/constants";
import { kstWeekday } from "@/lib/format";
import type { ClassSlot } from "@/lib/types";
import { ArrowUpRight, Clock3 } from "lucide-react";

type ClassWithSlots = { id: string; name: string; room: string | null; class_slots: ClassSlot[] };

// 오늘(한국 시간) 수업을 교시 순서대로 보여준다.
export function TodayClasses({ classes }: { classes: ClassWithSlots[] }) {
  const today = kstWeekday();
  const lessons = classes
    .flatMap((c) =>
      c.class_slots.filter((s) => s.day === today).map((s) => ({ ...c, period: s.period })),
    )
    .sort((a, b) => a.period - b.period);

  return (
    <section className="school-panel">
      <div className="school-panel-heading"><h3 className="school-panel-title"><Clock3 className="size-[18px] text-primary" aria-hidden="true" />오늘 수업</h3>
        <span className="text-xs text-muted-foreground">{today ? `${DAYS[today-1]}요일 · ${lessons.length}시간` : "주말"}</span></div>
      {lessons.length === 0 ? (
        <div className="px-5 py-7"><p className="text-sm font-medium">오늘은 등록된 수업이 없습니다.</p><p className="mt-1 text-xs text-muted-foreground">{today ? "주간 시간표에서 다른 요일의 수업을 확인하세요." : "다음 주 수업은 주간 시간표에서 확인하세요."}</p></div>
      ) : (
        <div className="divide-y px-4 sm:px-5">
          {lessons.map((l) => (
            <Link
              key={`${l.id}-${l.period}`}
              href={`/classes/${l.id}`}
              className="group flex min-h-18 min-w-0 items-center gap-3 py-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-primary">{l.period}교시</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold wrap-break-word group-hover:text-primary">{l.name}</span>
              {l.room && <span className="block text-xs text-muted-foreground">{l.room}</span>}</span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
