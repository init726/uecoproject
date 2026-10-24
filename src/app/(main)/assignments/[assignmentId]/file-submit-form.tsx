"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/constants";
import { formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ActionState } from "@/lib/types";
import { recordFileSubmission } from "./actions";

export function FileSubmitForm({ assignmentId, userId }: { assignmentId: string; userId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    // 화면에서 먼저 검사하고, 저장소 정책이 한 번 더 검사한다. (SEC-04)
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setState({ error: `${ALLOWED_EXTENSIONS.join(", ").toUpperCase()} 파일만 낼 수 있어요.` });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setState({ error: "파일은 10MB 이하만 낼 수 있어요." });
      return;
    }

    startTransition(async () => {
      // 한글 파일명은 저장소 경로에 쓸 수 없어서 경로는 시각으로 만들고, 원래 이름은 따로 기록한다.
      const path = `${assignmentId}/${userId}/${Date.now()}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("submissions").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (error) {
        setState({ error: "파일을 올리지 못했어요. 수업에 참여 중인지 확인해 주세요." });
        return;
      }
      const result = await recordFileSubmission(assignmentId, path, file.name);
      setState(result);
      if (!result.error) setFile(null);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        type="file"
        accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setState({});
        }}
        key={state.message ? "done" : "picking"}
      />
      {file && (
        <p className="text-xs text-muted-foreground">
          {file.name} · {formatFileSize(file.size)}
        </p>
      )}
      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={!file || pending}>
        {pending ? "올리는 중..." : "파일 제출"}
      </Button>
    </form>
  );
}
