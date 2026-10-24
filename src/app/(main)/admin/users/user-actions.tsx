"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { CopyButton } from "@/components/admin/copy-button";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/types";
import { deleteAccountAction, resetPasswordAction, type ResetState } from "../actions";

// 사용자 한 줄의 버튼들: 비밀번호 초기화, 삭제
export function UserActions({ userId, name, isMe }: { userId: string; name: string; isMe: boolean }) {
  const [reset, resetAction, resetting] = useActionState<ResetState>(
    resetPasswordAction.bind(null, userId),
    {},
  );
  const [removed, deleteAction, deleting] = useActionState<ActionState>(
    deleteAccountAction.bind(null, userId),
    {},
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm(`${name}의 비밀번호를 새 임시 비밀번호로 바꿀까요?`)) e.preventDefault();
          }}
        >
          <Button type="submit" variant="ghost" size="xs" disabled={resetting}>
            <KeyRound />
            초기화
          </Button>
        </form>
        {!isMe && (
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm(`${name} 계정을 삭제할까요? 되돌릴 수 없어요.`)) e.preventDefault();
            }}
          >
            <Button type="submit" variant="ghost" size="xs" disabled={deleting} className="text-destructive">
              <Trash2 />
              삭제
            </Button>
          </form>
        )}
      </div>
      {reset.password && (
        <div className="flex items-center gap-2 font-mono text-xs">
          새 비밀번호 <span className="text-primary">{reset.password}</span>
          <CopyButton text={reset.password} />
        </div>
      )}
      {(reset.error || removed.error) && (
        <p className="text-xs text-destructive">{reset.error ?? removed.error}</p>
      )}
    </div>
  );
}
