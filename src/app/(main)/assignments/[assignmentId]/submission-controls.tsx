"use client";
import { useActionState } from "react";
import { cancelSubmission, saveFeedback } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/form-message";

export function SubmissionControls({assignmentId}:{assignmentId:string}) {
 const [state, action, pending]=useActionState(cancelSubmission.bind(null,assignmentId),{});
 return <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm">제출 취소</summary><form action={action} className="mt-3 space-y-3"><p className="text-sm text-muted-foreground">취소하면 미제출 상태가 됩니다. 제출 내용과 시각은 기록에 남으며, 마감 전까지 다시 제출할 수 있습니다.</p><FormMessage state={state}/><Button disabled={pending} variant="outline">{pending?"취소 중…":"확인 후 제출 취소"}</Button></form></details>;
}
export function FeedbackForm({submissionId,body}:{submissionId:string;body:string}) {
 const [state,action,pending]=useActionState(saveFeedback.bind(null,submissionId),{});
 return <form action={action} className="mt-3 space-y-2"><label className="block text-sm font-medium" htmlFor={`feedback-${submissionId}`}>이 버전에 피드백 남기기</label><Textarea id={`feedback-${submissionId}`} name="body" defaultValue={body} maxLength={5000} rows={3} required/><FormMessage state={state}/><Button size="sm" disabled={pending}>{pending?"저장 중…":"피드백 저장"}</Button></form>;
}
