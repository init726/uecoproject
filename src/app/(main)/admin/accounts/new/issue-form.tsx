"use client";

import { useActionState, useState } from "react";
import { CopyButton } from "@/components/admin/copy-button";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, SERVICE_NAME } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { USERNAME_RULE } from "@/lib/username";
import { cn } from "@/lib/utils";
import { issueAccountAction, type IssueState } from "../../actions";

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "관리자", hint: "학교 운영 관리" },
  { value: "teacher", label: "교사", hint: "승인된 상태로 발급" },
  { value: "student", label: "학생", hint: "학번 필요" },
];

export function IssueForm() {
  // 발급이 끝나면 key를 바꿔 폼을 새로 그린다.
  const [round, setRound] = useState(0);
  return <IssueFormInner key={round} onReset={() => setRound((r) => r + 1)} />;
}

function IssueFormInner({ onReset }: { onReset: () => void }) {
  const [state, formAction, pending] = useActionState<IssueState, FormData>(issueAccountAction, {});
  const [role, setRole] = useState<Role>("teacher");

  if (state.credentials) {
    const c = state.credentials;
    const text = `[${SERVICE_NAME}] ${ROLE_LABEL[c.role]} 계정\n아이디: ${c.username}\n임시 비밀번호: ${c.password}\n첫 로그인 때 새 비밀번호를 정해야 해요.`;
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
        <p className="font-medium">
          {c.name} ({ROLE_LABEL[c.role]}) 계정을 발급했어요
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-mono text-sm">
          <dt className="text-muted-foreground">아이디</dt>
          <dd>{c.username}</dd>
          <dt className="text-muted-foreground">비밀번호</dt>
          <dd className="text-primary">{c.password}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          이 화면을 벗어나면 비밀번호를 다시 볼 수 없어요. 첫 로그인 때 새 비밀번호로 바꾸게 돼요.
        </p>
        <div className="flex gap-2">
          <CopyButton text={text} label="안내문 복사" />
          <Button type="button" onClick={onReset}>
            다른 계정 발급
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="mb-2 text-sm font-medium">계정 종류</legend>
        {ROLES.map((r) => (
          <label
            key={r.value}
            className={cn(
              "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm",
              role === r.value && "border-primary bg-primary/10",
            )}
          >
            <input
              type="radio"
              name="role"
              value={r.value}
              checked={role === r.value}
              onChange={() => setRole(r.value)}
              className="sr-only"
            />
            <span className="font-medium">{r.label}</span>
            <span className="text-xs text-muted-foreground">{r.hint}</span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">이름</Label>
          <Input id="name" name="name" required />
        </div>
        {role === "student" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="student_no">학번</Label>
            <Input id="student_no" name="student_no" inputMode="numeric" pattern="\d{5}" required />
          </div>
        )}
        {role === "teacher" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="subject">담당 교과</Label>
            <Input id="subject" name="subject" required />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">아이디</Label>
        <Input
          id="username"
          name="username"
          autoCapitalize="none"
          spellCheck={false}
          pattern="[A-Za-z0-9_]{4,20}"
          required
        />
        <p className="text-xs text-muted-foreground">{USERNAME_RULE}</p>
      </div>

      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "발급 중..." : "계정 발급"}
      </Button>
    </form>
  );
}
