"use client";

import { useActionState } from "react";
import { createNotice } from "@/app/(main)/classes/[classId]/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NoticeForm({ classId }: { classId: string }) {
  const [state, formAction, pending] = useActionState(createNotice.bind(null, classId), {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" maxLength={100} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="body">내용</Label>
        <Textarea id="body" name="body" rows={8} maxLength={5000} />
      </div>
      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "올리는 중..." : "공지 올리기"}
      </Button>
    </form>
  );
}
