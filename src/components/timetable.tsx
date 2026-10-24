import Link from "next/link";
import { DAYS, PERIODS } from "@/lib/constants";
import type { ClassSlot } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TimetableClass = {
  id: string;
  name: string;
  room: string | null;
  class_slots: ClassSlot[];
};

// 주간 시간표 (월~금 × 1~7교시). 칸을 누르면 그 클래스로 이동한다.
export function Timetable({ classes }: { classes: TimetableClass[] }) {
  const cells = new Map<string, TimetableClass[]>();
  for (const c of classes) {
    for (const slot of c.class_slots) {
      const key = `${slot.day}-${slot.period}`;
      cells.set(key, [...(cells.get(key) ?? []), c]);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full table-fixed border-collapse text-center text-xs">
        <thead>
          <tr className="bg-muted">
            <th className="w-8 py-2 font-medium" />
            {DAYS.map((day) => (
              <th key={day} className="py-2 font-medium">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((period) => (
            <tr key={period} className="border-t">
              <td className="bg-muted/50 py-2 text-muted-foreground">{period}</td>
              {DAYS.map((_, dayIndex) => {
                const here = cells.get(`${dayIndex + 1}-${period}`) ?? [];
                const conflict = here.length > 1;
                return (
                  <td key={dayIndex} className="h-14 border-l p-0.5 align-top">
                    {here.map((c) => (
                      <Link
                        key={c.id}
                        href={`/classes/${c.id}`}
                        className={cn(
                          "block rounded-md bg-primary/10 px-1 py-1 text-left leading-tight hover:bg-primary/20",
                          conflict && "bg-destructive/10 text-destructive",
                        )}
                      >
                        <span className="line-clamp-2 font-medium">{c.name}</span>
                        {c.room && !conflict && (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {c.room}
                          </span>
                        )}
                      </Link>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
