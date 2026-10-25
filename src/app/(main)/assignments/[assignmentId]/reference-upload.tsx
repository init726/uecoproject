"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_REFERENCE_SIZE, REFERENCE_EXTENSIONS } from "@/lib/constants";
import { formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ActionState } from "@/lib/types";
import { recordAssignmentFile } from "./actions";

// 교사가 과제에 참고 자료(PDF 등)를 붙인다. 학생 파일 제출과 같은 방식: 브라우저가 저장소에 바로 올리고 경로만 기록한다.
export function ReferenceUpload({ assignmentId }: { assignmentId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!REFERENCE_EXTENSIONS.includes(ext)) {
      setState({ error: `${REFERENCE_EXTENSIONS.join(", ").toUpperCase()} 파일만 올릴 수 있어요.` });
      return;
    }
    if (file.size > MAX_REFERENCE_SIZE) {
      setState({ error: "참고 자료는 20MB 이하만 올릴 수 있어요." });
      return;
    }
    startTransition(async () => {
      // 한글 파일명은 저장소 경로에 쓸 수 없어서 경로는 시각으로 만들고, 원래 이름은 따로 기록한다.
      const path = `${assignmentId}/${Date.now()}.${ext}`;
      const { error } = await createClient().storage.from("assignment-files").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (error) {
        setState({ error: "파일을 올리지 못했어요. DB 업데이트(update-assignment-tools.sql)를 확인해 주세요." });
        return;
      }
      const result = await recordAssignmentFile(assignmentId, path, file.name);
      setState(result);
      if (!result.error) setFile(null);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        type="file"
        accept={REFERENCE_EXTENSIONS.map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setState({});
        }}
        key={state.message ? "done" : "picking"}
        className="sm:flex-1"
      />
      <Button type="submit" variant="outline" disabled={!file || pending}>
        {pending ? "올리는 중..." : file ? `올리기 (${formatFileSize(file.size)})` : "올리기"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
