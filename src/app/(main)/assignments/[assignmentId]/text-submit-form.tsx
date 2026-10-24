"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { countChars } from "@/lib/format";
import { cn } from "@/lib/utils";
import { submitText } from "./actions";

// 이 기기(브라우저)에 저장된 임시저장 글을 읽는다. 사생활 보호 모드 등에서는 null.
function readDraft(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

// ASG-03: 글 작성. 쓰는 동안 이 기기에 자동으로 임시저장한다.
export function TextSubmitForm({
  assignmentId,
  maxChars,
  lastSubmitted,
}: {
  assignmentId: string;
  maxChars: number;
  lastSubmitted: string | null;
}) {
  const draftKey = `draft:${assignmentId}`;
  const [state, formAction, pending] = useActionState(submitText.bind(null, assignmentId), {});
  const savedDraft = useSyncExternalStore(
    subscribeStorage,
    () => readDraft(draftKey),
    () => null, // 서버에서는 임시저장을 알 수 없다.
  );
  // 아직 아무것도 고치지 않았으면(null) 임시저장 글 → 마지막 제출 글 순서로 보여준다.
  const [edited, setEdited] = useState<string | null>(null);
  const content = edited ?? savedDraft ?? lastSubmitted ?? "";
  const restored = edited === null && savedDraft !== null && savedDraft !== lastSubmitted;

  // 제출에 성공하면 임시저장을 지운다.
  useEffect(() => {
    if (!state.message) return;
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  }, [state, draftKey]);

  function handleChange(value: string) {
    setEdited(value);
    try {
      localStorage.setItem(draftKey, value);
    } catch {}
  }

  const count = countChars(content);
  const over = count > maxChars;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {restored && (
        <p className="text-xs text-muted-foreground">제출하지 않은 임시저장 글을 불러왔어요.</p>
      )}
      <Textarea
        name="content"
        rows={12}
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        aria-invalid={over}
      />
      <p className={cn("text-right text-sm", over ? "text-destructive" : "text-muted-foreground")}>
        {count} / {maxChars}자
      </p>
      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending || over || !content.trim()}>
        {pending ? "제출 중..." : lastSubmitted ? "다시 제출" : "제출"}
      </Button>
    </form>
  );
}
