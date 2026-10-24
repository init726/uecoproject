"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createAssignment } from "./actions";

const TYPES = [
  { value: "file", label: "파일 제출", hint: "수행평가 보고서 등 (PDF, HWP, DOCX, 이미지, ZIP)" },
  { value: "text", label: "글 작성", hint: "생기부 자료용 글 (글자 수 제한)" },
] as const;

export function AssignmentForm({ classId }: { classId: string }) {
  const [state, formAction, pending] = useActionState(createAssignment.bind(null, classId), {});
  const [type, setType] = useState<"file" | "text">("file");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-medium">제출 방식</legend>
        {TYPES.map((t) => (
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
        <Input id="title" name="title" maxLength={100} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">설명</Label>
        <Textarea id="description" name="description" rows={4} maxLength={5000} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rubric">평가 기준</Label>
        <Textarea
          id="rubric"
          name="rubric"
          rows={4}
          maxLength={5000}
          placeholder={"예)\n- 주제 이해 (30점)\n- 근거 제시 (40점)\n- 표현과 구성 (30점)"}
        />
        <p className="text-xs text-muted-foreground">
          학생에게 그대로 공개돼요. 기준을 미리 알리면 평가에 대한 오해가 줄어요.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="due_at">마감 일시</Label>
          <Input id="due_at" name="due_at" type="datetime-local" required />
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
              defaultValue={500}
              required
            />
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allow_late" defaultChecked className="size-4" />
        마감 후에도 제출 받기 (지각으로 표시)
      </label>

      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "저장 중..." : "과제 내기"}
      </Button>
    </form>
  );
}
