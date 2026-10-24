"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { USERNAME_RULE } from "@/lib/username";
import { changeMyUsername } from "./actions";

export function UsernameForm({ currentId }: { currentId: string }) {
  const [state, formAction, pending] = useActionState(changeMyUsername, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          name="username"
          placeholder={currentId}
          aria-label="새 아이디"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          pattern="[A-Za-z0-9_]{4,20}"
          required
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "바꾸는 중..." : "아이디 바꾸기"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{USERNAME_RULE}</p>
      <FormMessage state={state} />
    </form>
  );
}
