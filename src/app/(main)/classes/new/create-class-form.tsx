"use client";

import { useActionState } from "react";
import { createClass } from "@/app/(main)/classes/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAYS, PERIODS } from "@/lib/constants";

export function CreateClassForm() {
  const [state, formAction, pending] = useActionState(createClass, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">과목명</Label>
        <Input id="name" name="name" placeholder="수학Ⅱ" maxLength={50} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="semester">학기</Label>
          <Input id="semester" name="semester" defaultValue="2026-2학기" maxLength={30} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="room">강의실 (선택)</Label>
          <Input id="room" name="room" placeholder="2-3 교실" maxLength={30} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">수업 요일·교시 (여러 개 선택)</legend>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full table-fixed text-center text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="w-8 py-2" />
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
                  {DAYS.map((day, dayIndex) => (
                    <td key={day} className="border-l p-0">
                      <label className="group flex h-10 cursor-pointer items-center justify-center hover:bg-muted has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-inset">
                        <input
                          type="checkbox"
                          name="slots"
                          value={`${dayIndex + 1}-${period}`}
                          className="sr-only"
                          aria-label={`${day}요일 ${period}교시`}
                        />
                        <span aria-hidden className="opacity-0 group-has-checked:opacity-100">
                          ✓
                        </span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "만드는 중..." : "클래스 만들기"}
      </Button>
    </form>
  );
}
