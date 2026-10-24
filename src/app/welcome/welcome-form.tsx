"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USERNAME_RULE } from "@/lib/username";
import { completeFirstLogin } from "./actions";

export function WelcomeForm({ currentId }: { currentId: string }) {
  const [state, formAction, pending] = useActionState(completeFirstLogin, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">새 아이디 (바꾸고 싶을 때만)</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          pattern="[A-Za-z0-9_]{4,20}"
        />
        <p className="text-xs text-muted-foreground">
          비워 두면 지금 아이디({currentId})를 그대로 써요. {USERNAME_RULE}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">새 비밀번호 (8자 이상)</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">새 비밀번호 확인</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "저장 중..." : "시작하기"}
      </Button>
    </form>
  );
}
