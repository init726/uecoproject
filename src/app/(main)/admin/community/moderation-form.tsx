"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REASON_MAX } from "@/lib/constants";
import type { ContentStatus } from "@/lib/types";
import { moderateContent } from "./actions";

// 사유를 적고 버튼을 누르면 처리된다. 게시 중이면 숨김/삭제, 검토 중이면 복구/삭제.
export function ModerationForm({
  postId,
  commentId,
  status,
}: {
  postId?: string;
  commentId?: string;
  status: ContentStatus;
}) {
  const [state, formAction, pending] = useActionState(moderateContent.bind(null, { postId, commentId }), {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Input name="reason" maxLength={REASON_MAX} placeholder="처리 사유 (필수, 기록으로 남아요)" required />
      <FormMessage state={state} />
      <div className="flex gap-2">
        {status === "review" ? (
          <Button type="submit" name="action" value="restore" size="sm" disabled={pending}>
            복구
          </Button>
        ) : (
          <Button type="submit" name="action" value="hide" size="sm" variant="outline" disabled={pending}>
            숨김
          </Button>
        )}
        <Button type="submit" name="action" value="delete" size="sm" variant="destructive" disabled={pending}>
          삭제
        </Button>
      </div>
    </form>
  );
}
