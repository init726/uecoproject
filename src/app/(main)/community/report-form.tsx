"use client";

import { Flag } from "lucide-react";
import { useActionState } from "react";
import { reportContent } from "@/app/(main)/community/actions";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REASON_MAX } from "@/lib/constants";

// 글/댓글 신고. "신고" 버튼을 누르면 사유 입력칸이 펼쳐진다.
export function ReportForm({
  postId,
  commentId,
  redirectTo,
}: {
  postId?: string;
  commentId?: string;
  redirectTo: string;
}) {
  const [state, formAction, pending] = useActionState(
    reportContent.bind(null, { postId, commentId, redirectTo }),
    {},
  );

  return (
    <details className="text-sm [&[open]>summary]:text-destructive">
      <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-destructive">
        <Flag className="size-3.5" aria-hidden="true" />
        신고
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
        <Textarea name="reason" rows={2} maxLength={REASON_MAX} placeholder="신고 사유를 적어 주세요" required />
        <FormMessage state={state} />
        <Button type="submit" size="sm" variant="destructive" className="self-end" disabled={pending}>
          {pending ? "보내는 중..." : "신고하기"}
        </Button>
      </form>
    </details>
  );
}
