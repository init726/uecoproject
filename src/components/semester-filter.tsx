"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Semester } from "@/lib/semesters";

export function SemesterFilter({ semesters, selected }: { semesters: Semester[]; selected: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label htmlFor="home-semester" className="text-xs font-medium text-muted-foreground">조회 학기</label>
      <select id="home-semester" value={selected} disabled={pending} className="form-select w-auto min-w-36 font-medium"
        onChange={(e) => startTransition(() => router.push(`/home?semester=${encodeURIComponent(e.target.value)}`))}>
        {semesters.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
      </select>
      <span role="status" className="sr-only">{pending ? "학기 불러오는 중" : ""}</span>
    </div>
  );
}
