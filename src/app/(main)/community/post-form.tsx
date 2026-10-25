"use client";

import { Check, CircleHelp, Megaphone, MessagesSquare } from "lucide-react";
import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { POST_BODY_MAX, POST_KIND_LABEL, POST_TITLE_MAX } from "@/lib/constants";
import type { ActionState, PostKind } from "@/lib/types";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

// 말머리 선택 카드에 보이는 아이콘과 한 줄 설명
const KIND_CHOICE = {
  notice: { icon: Megaphone, hint: "학교 전체에 알리는 글" },
  question: { icon: CircleHelp, hint: "궁금한 걸 묻고 답변을 채택해요" },
  free: { icon: MessagesSquare, hint: "학교생활 이야기를 편하게 나눠요" },
} satisfies Record<PostKind, { icon: typeof Check; hint: string }>;

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
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">어디에 올릴까요?</legend>
          <div className={cn("grid gap-3", kinds.length > 1 && "sm:grid-cols-2")}>
            {kinds.map((kind, i) => {
              const { icon: Icon, hint } = KIND_CHOICE[kind];
              return (
                // 라디오 동그라미는 숨기고 카드 전체를 누르는 방식. 고른 카드에만 강조 색과 체크 표시가 나온다.
                <label
                  key={kind}
                  className="group relative flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted has-checked:border-foreground has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
                >
                  <input type="radio" name="kind" value={kind} defaultChecked={i === 0} className="sr-only" />
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground group-has-checked:border-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold">{POST_KIND_LABEL[kind]}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground group-has-checked:text-accent-foreground/80">{hint}</span>
                  </span>
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition-opacity group-has-checked:opacity-100"
                    aria-hidden="true"
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
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
