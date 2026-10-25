"use client";

import { useEffect, useState, useTransition } from "react";
import { deadlineLoad } from "@/app/(main)/classes/[classId]/assignments/new/actions";
import { cn } from "@/lib/utils";

export type DeadlineRow = { load_day: string; assignment_count: number; student_count: number; max_per_student: number; class_names: string[] };

// 학생 1명이 같은 날 이만큼 이상 마감을 맞으면 "몰림"으로 강조한다.
const BUSY = 3;

// 마감 날짜를 고르면 바로, 이 수업 학생들이 그날 다른 수업까지 합쳐 과제 마감이 몇 개인지 보여 준다.
export function DeadlineLoad({ classId, day }: { classId: string; day: string }) {
  const [result, setResult] = useState<{ day: string; rows?: DeadlineRow[]; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!day) return;
    startTransition(async () => {
      const next = await deadlineLoad(classId, day);
      setResult({ day, ...next });
    });
  }, [classId, day]);

  const current = result?.day === day ? result : null;
  const row = current?.rows?.[0];
  const busy = (row?.max_per_student ?? 0) >= BUSY;

  return (
    <section
      className={cn("rounded-2xl border p-4", busy && "border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-950/30")}
      aria-live="polite"
    >
      <h3 className="text-sm font-semibold">그날 과제 몰림</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {!day
          ? "마감 날짜를 고르면 수강생들의 그날 다른 과제 마감 수를 바로 보여 줘요."
          : pending || !current
            ? "확인하는 중…"
            : current.error
              ? current.error
              : !row
                ? "이 날짜에 마감인 다른 과제가 없어요."
                : `이미 ${row.assignment_count}개 과제가 마감이에요. 학생 1명당 최대 ${row.max_per_student}개 (${row.class_names.join(", ")})`}
      </p>
      {busy && current && !pending && (
        <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-300">
          과제가 몰린 날이에요. 다른 날로 옮기는 것도 생각해 보세요.
        </p>
      )}
    </section>
  );
}
