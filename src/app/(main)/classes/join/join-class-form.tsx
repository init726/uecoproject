"use client";

import Link from "next/link";
import { useActionState } from "react";
import { joinClass, leaveClass, type JoinState } from "@/app/(main)/classes/actions";
import { FormMessage } from "@/components/form-message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JoinClassForm() {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(joinClass, {});

  // 참여는 됐지만 기존 수업과 시간이 겹치는 경우: 경고하고 그대로 둘지 고르게 한다.
  if (state.classId && state.conflicts) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>이미 듣는 수업과 시간이 겹쳐요</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {state.conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
        <div className="grid grid-cols-2 gap-2">
          <form action={leaveClass.bind(null, state.classId)}>
            <SubmitButton variant="outline" className="w-full" pendingText="취소 중...">
              참여 취소
            </SubmitButton>
          </form>
          <Button asChild>
            <Link href={`/classes/${state.classId}`}>그래도 참여</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        name="code"
        placeholder="예: K7M2QX"
        maxLength={6}
        autoComplete="off"
        autoCapitalize="characters"
        className="h-12 text-center text-xl tracking-[0.4em] uppercase"
        required
      />
      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "확인 중..." : "참여하기"}
      </Button>
    </form>
  );
}
