"use client";

import { useActionState, useEffect, useRef } from "react";
import { createComment } from "@/app/(main)/community/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX } from "@/lib/constants";

export function CommentForm({ postId }: { postId: string }) {
  const [state, formAction, pending] = useActionState(createComment.bind(null, postId), {});
  const formRef = useRef<HTMLFormElement>(null);

  // 댓글이 달리면 입력칸을 비운다. (실패했을 때는 쓰던 글을 남겨 둔다)
  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <Textarea name="body" rows={3} maxLength={COMMENT_MAX} placeholder="댓글을 남겨 보세요" aria-label="댓글 내용" required />
      <FormMessage state={state} />
      <Button type="submit" size="sm" className="self-end" disabled={pending}>
        {pending ? "등록하는 중..." : "댓글 달기"}
      </Button>
    </form>
  );
}
