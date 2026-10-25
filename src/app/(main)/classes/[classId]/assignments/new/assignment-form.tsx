"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DeadlineLoad } from "@/components/deadline-load";
import { createAssignment, updateAssignment } from "./actions";

const TYPES = [
  { value: "file", label: "파일 제출", hint: "수행평가 보고서 등 (PDF, HWP, DOCX, 이미지, ZIP)" },
  { value: "text", label: "글 작성", hint: "생기부 자료용 글 (글자 수 제한)" },
] as const;

// 고칠 때 넣는 원래 값. due_at 은 datetime-local 형식("2026-11-03T18:00", 한국 시간)
export type AssignmentInitial = {
  id: string;
  title: string;
  description: string;
  rubric: string;
  due_at: string;
  type: "file" | "text";
  max_chars: number | null;
  allow_late: boolean;
  self_review: boolean;
};

// 과제 내기와 과제 고치기가 함께 쓰는 폼. 고칠 때는 제출 방식과 자기평가서 여부를 바꿀 수 없다.
export function AssignmentForm({ classId, initial }: { classId: string; initial?: AssignmentInitial }) {
  const [state, formAction, pending] = useActionState(
    initial ? updateAssignment.bind(null, initial.id, initial.type) : createAssignment.bind(null, classId),
    {},
  );
  const [type, setType] = useState<"file" | "text">(initial?.type ?? "file");

  const [due, setDue] = useState(initial?.due_at ?? "");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className={cn("grid gap-2", initial ? "grid-cols-1" : "grid-cols-2")}>
        <legend className="mb-2 text-sm font-medium">
          제출 방식{initial && <span className="ml-2 text-xs font-normal text-muted-foreground">이미 낸 과제는 바꿀 수 없어요</span>}
        </legend>
        {TYPES.filter((t) => !initial || t.value === initial.type).map((t) => (
          <label
            key={t.value}
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm",
              type === t.value && "border-primary ring-1 ring-primary",
            )}
          >
            <input
              type="radio"
              name="type"
              value={t.value}
              checked={type === t.value}
              onChange={() => setType(t.value)}
              className="sr-only"
            />
            <span className="font-medium">{t.label}</span>
            <span className="text-xs text-muted-foreground">{t.hint}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" maxLength={100} defaultValue={initial?.title} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">설명</Label>
        <Textarea id="description" name="description" rows={4} maxLength={5000} defaultValue={initial?.description} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rubric">평가 기준</Label>
        <Textarea
          id="rubric"
          name="rubric"
          rows={4}
          maxLength={5000}
          defaultValue={initial?.rubric}
        />
        <p className="text-xs text-muted-foreground">
          학생에게 그대로 공개돼요. 기준을 미리 알리면 평가에 대한 오해가 줄어요.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="due_at">마감 일시</Label>
          <Input id="due_at" name="due_at" type="datetime-local" value={due} onChange={e=>setDue(e.target.value)} required />
        </div>
        {type === "text" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="max_chars">글자 수 제한</Label>
            <Input
              id="max_chars"
              name="max_chars"
              type="number"
              min={50}
              max={10000}
              step={50}
              defaultValue={initial?.max_chars ?? 500}
              required
            />
          </div>
        )}
      </div>

      <DeadlineLoad classId={classId} day={due.slice(0,10)} />
      {type === "text" && !initial && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="self_review" className="size-4" />자기평가서 과제 (기존 글 제출 내용을 바탕으로 AI 초안 지원)</label>}
      {initial?.self_review && <p className="text-sm text-muted-foreground">자기평가서 과제입니다. (바꿀 수 없어요)</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allow_late" defaultChecked={initial?.allow_late ?? true} className="size-4" />
        마감 후에도 제출 받기 (지각으로 표시)
      </label>

      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "저장 중..." : initial ? "고친 내용 저장" : "과제 내기"}
      </Button>
    </form>
  );
}
