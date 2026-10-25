"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { POST_BODY_MAX, POST_KIND_LABEL, POST_TITLE_MAX } from "@/lib/constants";
import type { ActionState, PostKind } from "@/lib/types";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

// 글 쓰기와 글 고치기가 함께 쓰는 폼. 고칠 때는 종류를 바꿀 수 없다.
export function PostForm({
  action,
  kinds,
  initial,
  submitLabel,
}: {
  action: Action;
  kinds?: PostKind[]; // 글 쓰기일 때만 (고치기에서는 생략)
  initial?: { title: string; body: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {kinds && (
        <div className="flex flex-col gap-2">
          <Label>말머리</Label>
          <div className="flex flex-wrap gap-2">
            {kinds.map((kind, i) => (
              <label
                key={kind}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border bg-card px-4 text-sm text-muted-foreground transition-colors hover:bg-muted has-checked:border-foreground has-checked:font-bold has-checked:text-foreground has-checked:ring-1 has-checked:ring-foreground"
              >
                <input type="radio" name="kind" value={kind} defaultChecked={i === 0} className="accent-primary" />
                {POST_KIND_LABEL[kind]}
              </label>
            ))}
          </div>
        </div>
      )}
      {kinds?.includes("notice") && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="pinned" className="size-4 accent-primary" /> 목록 맨 위에 고정
        </label>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" defaultValue={initial?.title} maxLength={POST_TITLE_MAX} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="body">내용</Label>
        <Textarea id="body" name="body" rows={10} defaultValue={initial?.body} maxLength={POST_BODY_MAX} required />
      </div>
      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "저장하는 중..." : submitLabel}
      </Button>
    </form>
  );
}
