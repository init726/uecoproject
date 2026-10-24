"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { updateComment } from "@/app/(main)/community/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX } from "@/lib/constants";
import type { ActionState } from "@/lib/types";

// 내 댓글 고치기. "수정"을 누르면 입력칸이 펼쳐지고, 저장하면 접힌다.
export function CommentEdit({ postId, commentId, body }: { postId: string; commentId: string; body: string }) {
  const [open, setOpen] = useState(false);
  // 저장에 성공하면 접는다. (실패했을 때는 열어 둔 채 사유를 보여 준다)
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateComment(postId, commentId, prev, formData);
    if (result.message) setOpen(false);
    return result;
  }, {});

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <Pencil aria-hidden="true" />
        수정
      </Button>
    );
  }

  return (
    <form action={formAction} className="mt-1 flex w-full flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <Textarea
        name="body"
        rows={3}
        defaultValue={body}
        maxLength={COMMENT_MAX}
        aria-label="댓글 수정"
        required
        autoFocus
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "저장하는 중..." : "저장"}
        </Button>
      </div>
    </form>
  );
}
