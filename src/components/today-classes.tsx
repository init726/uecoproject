import Link from "next/link";
import { DAYS } from "@/lib/constants";
import { kstWeekday } from "@/lib/format";
import type { ClassSlot } from "@/lib/types";

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
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">
        오늘 수업 <span className="text-sm font-normal text-muted-foreground">{today ? `${DAYS[today - 1]}요일` : "주말"}</span>
      </h3>
      {lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">오늘은 수업이 없어요.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {lessons.map((l) => (
            <Link
              key={`${l.id}-${l.period}`}
              href={`/classes/${l.id}`}
              className="flex shrink-0 flex-col rounded-xl border bg-background px-3 py-2 hover:border-primary"
            >
              <span className="text-xs font-medium text-primary">{l.period}교시</span>
              <span className="text-sm font-medium">{l.name}</span>
              {l.room && <span className="text-xs text-muted-foreground">{l.room}</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
