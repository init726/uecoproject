"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createClass, updateClass, type ClassFormState } from "@/app/(main)/classes/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAYS, PERIODS } from "@/lib/constants";
import type { Semester } from "@/lib/semesters";
import type { ClassRow, ClassSlot } from "@/lib/types";

export function CreateClassForm({ semesters, defaultSemester, initial }: {
  semesters: Semester[];
  defaultSemester: string;
  initial?: ClassRow & { class_slots: ClassSlot[] };
}) {
  const action = initial ? updateClass.bind(null, initial.id) : createClass;
  const [state, formAction, pending] = useActionState<ClassFormState, FormData>(action, {});
  const [name, setName] = useState(initial?.name ?? "");
  const [semester, setSemester] = useState(initial?.semester ?? defaultSemester);
  const [room, setRoom] = useState(initial?.room ?? "");
  const [slots, setSlots] = useState(initial?.class_slots.map((s) => `${s.day}-${s.period}`) ?? []);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-7" onChange={(event) => {
      const target = event.target;
      if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement) && target.name !== "allow_conflicts") setConfirmed(false);
    }}>
      <section className="surface flex flex-col gap-5 p-5 sm:p-6" aria-label="클래스 정보">
        <h3 className="font-semibold">기본 정보</h3>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">과목명</Label>
          <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="semester">학기</Label>
            <select id="semester" name="semester" className="form-select" value={semester}
              onChange={(e) => setSemester(e.target.value)} required>
              {semesters.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="room">강의실 <span className="font-normal text-muted-foreground">선택</span></Label>
            <Input id="room" name="room" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={30} />
          </div>
        </div>
      </section>

      <fieldset className="surface p-5 sm:p-6">
        <legend className="sr-only">수업 요일·교시</legend>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">수업 시간</h3>
          <span className="text-sm text-primary">{slots.length}시간 선택</span>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full table-fixed text-center text-sm">
            <thead><tr className="bg-muted">
              <th className="w-10 py-3"><span className="sr-only">교시</span></th>
              {DAYS.map((day) => <th key={day} scope="col" className="py-3 font-medium">{day}</th>)}
            </tr></thead>
            <tbody>{PERIODS.map((period) => <tr key={period} className="border-t">
              <th scope="row" className="bg-muted/50 font-normal text-muted-foreground">{period}</th>
              {DAYS.map((day, dayIndex) => {
                const value = `${dayIndex + 1}-${period}`;
                return <td key={day} className="border-l p-0">
                  <label className="group flex h-12 cursor-pointer items-center justify-center hover:bg-accent has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-inset">
                    <input type="checkbox" name="slots" value={value} checked={slots.includes(value)}
                      onChange={(e) => setSlots(e.target.checked ? [...slots, value] : slots.filter((s) => s !== value))}
                      className="sr-only" aria-label={`${day}요일 ${period}교시`} />
                    <span aria-hidden className="opacity-0 group-has-checked:opacity-100">✓</span>
                  </label>
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        {initial && <p className="mt-3 text-sm text-muted-foreground">변경한 시간은 참여 학생의 시간표에도 반영됩니다.</p>}
      </fieldset>

      {!!state.conflicts?.length && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">같은 학기의 다른 수업과 시간이 겹칩니다.</p>
        <ul className="mt-2 list-inside list-disc">{state.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
        <label className="mt-3 flex items-start gap-2">
          <input type="checkbox" name="allow_conflicts" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4" />
          겹치는 시간을 확인했으며 이대로 저장합니다.
        </label>
      </div>}
      <FormMessage state={state} />
      <div className="flex gap-3">
        <Button asChild variant="outline" size="lg"><Link href={initial ? `/classes/${initial.id}` : "/home"}>취소</Link></Button>
        <Button type="submit" size="lg" className="flex-1" disabled={pending || slots.length === 0}>
          {pending ? "저장 중..." : initial ? "변경사항 저장" : "클래스 만들기"}
        </Button>
      </div>
    </form>
  );
}
