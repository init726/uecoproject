import {withSchemaFallback,isMissingSchema} from "@/lib/schema-compat";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Paperclip } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { countChars, formatDateTime, formatFileSize, isPast } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Assignment, Submission } from "@/lib/types";
import { deleteAssignmentFile } from "./actions";
import { FileSubmitForm } from "./file-submit-form";
import { ReferenceUpload } from "./reference-upload";
import { SubmissionControls, FeedbackForm } from "./submission-controls";
import { TextSubmitForm } from "./text-submit-form";
import { PageHeader } from "@/components/page-header";

type Member = {
  student_id: string;
  student: { name: string; student_no: string | null } | null;
};

type AssignmentDetail = Assignment & {
  class: { id: string; name: string; teacher_id: string; enrollments: Member[] } | null;
};

const SUBMISSION_COLUMNS =
  "id, assignment_id, student_id, version, file_path, file_name, file_size, content, submitted_at, is_late, canceled_at";

// 이 화면의 AI 서버 동작(학교 AI 컴퓨터의 Ollama)은 수십 초 걸릴 수 있다. 배포 환경의 실행 시간 제한을 늘린다.
export const maxDuration = 150;

export default async function AssignmentPage(props: PageProps<"/assignments/[assignmentId]">) {
  const { assignmentId } = await props.params;
  const supabase = await createClient();

  // 프로필, 과제(+반 학생 명단), 제출물을 동시에 가져온다.
  // RLS: 학생에게는 자기 제출물과 자기 수강 정보만, 담당 교사에게는 반 전체가 돌아온다.
  const [profile, { data: assignment, error: assignmentError, extended: purposeReady }, { data: submissionRows, error: submissionError, extended: cancelReady }] = await Promise.all([
    getProfile(),
    withSchemaFallback<AssignmentDetail>(extended => supabase
      .from("assignments")
      .select(
        `id, class_id, title, description, rubric, due_at, type, max_chars, allow_late${extended ? ", purpose" : ""}, class:classes(id, name, teacher_id, enrollments(student_id, student:profiles!enrollments_student_id_fkey(name, student_no)))`,
      )
      .eq("id", assignmentId)
      .maybeSingle<AssignmentDetail>(), ["purpose"]),
    withSchemaFallback<Submission[]>(extended => supabase
      .from("submissions")
      .select(extended ? SUBMISSION_COLUMNS : SUBMISSION_COLUMNS.replace(", canceled_at", ""))
      .eq("assignment_id", assignmentId)
      .order("version", { ascending: false })
      .overrideTypes<Submission[], { merge: false }>(), ["canceled_at"]),
  ]);
  if (assignmentError) throw new Error("과제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  if (submissionError) throw new Error("제출 기록을 불러오지 못했습니다. DB 업데이트를 확인해 주세요.");
  if (!assignment?.class) notFound();
  const submissions = submissionRows ?? [];

  // 피드백과 AI 초안 기록은 서로 상관없으므로 동시에 받는다.
  const empty = { data: [], error: null };
  const [{ data: feedbackRows, error: feedbackError }, { data: aiLogs, error: aiError }, { data: fileRows, error: filesError }] = await Promise.all([
    submissions.length ? supabase.from("submission_feedback").select("submission_id, body, updated_at").in("submission_id", submissions.map(s=>s.id)) : Promise.resolve(empty),
    purposeReady && assignment.purpose==="self_review" ? supabase.from("ai_draft_logs").select("student_id,created_at").eq("assignment_id",assignmentId) : Promise.resolve(empty),
    supabase.from("assignment_files").select("id, file_name, file_size").eq("assignment_id", assignmentId).order("created_at"),
  ]);
  // 참고 자료 표(update-assignment-tools.sql) 전이면 자료 칸만 숨긴다.
  const filesReady = !isMissingSchema(filesError, ["assignment_files"]);
  if (filesError && filesReady) throw new Error("참고 자료를 불러오지 못했습니다.");
  const files = fileRows ?? [];
  const feedbackReady=!isMissingSchema(feedbackError,["submission_feedback"]);
  if (feedbackError && feedbackReady) throw new Error("피드백을 불러오지 못했습니다. DB 업데이트를 확인해 주세요.");
  const feedback = Object.fromEntries((feedbackRows ?? []).map(f=>[f.submission_id,f]));
  if(aiError && !isMissingSchema(aiError,["ai_draft_logs"]))throw new Error("AI 초안 요청 기록을 불러오지 못했습니다.");
  const aiCounts:Record<string,number>={};for(const log of aiLogs??[])aiCounts[log.student_id]=(aiCounts[log.student_id]??0)+1;
  const isTeacher = assignment.class.teacher_id === profile.id;
  const overdue = isPast(assignment.due_at);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href={`/classes/${assignment.class.id}`} className="hover:text-foreground">
            ← {assignment.class.name}
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Badge variant="outline">{assignment.type === "file" ? "파일" : "글"}</Badge>
            {assignment.title}
          </span>
        }
        description={
          <span className={overdue ? "text-destructive" : undefined}>
            마감 {formatDateTime(assignment.due_at)}
            {overdue && " (마감됨)"}
            {" · "}
            {assignment.allow_late ? "마감 후에도 제출 가능" : "마감 후 제출 불가"}
            {assignment.max_chars && ` · ${assignment.max_chars}자 이내`}
          </span>
        }
        actions={
          isTeacher && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/assignments/${assignment.id}/edit`}>과제 수정</Link>
            </Button>
          )
        }
      />

      {(assignment.description || assignment.rubric) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {assignment.description && (
            <InfoCard title="설명" text={assignment.description} />
          )}
          {assignment.rubric && <InfoCard title="평가 기준" text={assignment.rubric} />}
        </div>
      )}

      {filesReady && (isTeacher || files.length > 0) && (
        <section className="school-panel">
          <div className="school-panel-heading">
            <h3 className="school-panel-title">
              <Paperclip className="size-[18px] text-primary" aria-hidden="true" />
              참고 자료
            </h3>
            {isTeacher && <span className="text-xs text-muted-foreground">학생은 내려받기만 할 수 있어요</span>}
          </div>
          <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
            {files.length === 0 && <p className="text-sm text-muted-foreground">아직 올린 자료가 없어요. 과제 안내 PDF 등을 올려 보세요.</p>}
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-3">
                <a href={`/assignment-files/${f.id}/download`} className="min-w-0 flex-1 truncate text-sm font-medium underline underline-offset-4">
                  {f.file_name}
                  {f.file_size ? ` (${formatFileSize(f.file_size)})` : ""}
                </a>
                {isTeacher && (
                  <form action={deleteAssignmentFile.bind(null, assignmentId, f.id)}>
                    <ConfirmButton variant="ghost" size="xs" confirm="이 자료를 지울까요?">삭제</ConfirmButton>
                  </form>
                )}
              </div>
            ))}
            {isTeacher && <ReferenceUpload assignmentId={assignmentId} />}
          </div>
        </section>
      )}

      {isTeacher ? (
        <TeacherView members={assignment.class.enrollments} submissions={submissions} feedback={feedback} aiCounts={aiCounts} feedbackReady={feedbackReady} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{submissions.length > 0 ? "다시 제출하기" : "제출하기"}</CardTitle>
            </CardHeader>
            <CardContent>
              {overdue && !assignment.allow_late ? (
                <p className="text-sm text-muted-foreground">마감이 지나 제출할 수 없어요.</p>
              ) : assignment.type === "file" ? (
                <FileSubmitForm assignmentId={assignmentId} userId={profile.id} />
              ) : (
                <TextSubmitForm
                  assignmentId={assignmentId}
                  userId={profile.id}
                  purpose={assignment.purpose??null}
                  aiEnabled={purposeReady && feedbackReady}
                  maxChars={assignment.max_chars ?? 10000}
                  lastSubmitted={submissions[0]?.content ?? null}
                />
              )}
            </CardContent>
          </Card>

          {cancelReady && submissions[0] && !submissions[0].canceled_at && !overdue && <SubmissionControls assignmentId={assignmentId} />}
          {submissions[0] && (
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">내 제출</h3>
              <p className="text-xs text-muted-foreground">제출 시각은 서버 시간으로 기록돼요. 다시 내면 새 제출로 바뀌어요.</p>
              <SubmissionItem submission={submissions[0]} />
              {feedback[submissions[0].id] && <FeedbackBody feedback={feedback[submissions[0].id]} />}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ASG-05: 교사용 제출 현황 (제출 / 마감 후 제출 / 미제출). 학생마다 가장 최근 제출만 보여 준다.
type Feedback = { body: string; updated_at: string };
function TeacherView({ members: memberRows, submissions, feedback, aiCounts, feedbackReady }: { feedbackReady:boolean; aiCounts:Record<string,number>; members: Member[]; submissions: Submission[]; feedback: Record<string, Feedback> }) {
  const members = [...memberRows].sort((a, b) =>
    (a.student?.student_no ?? "").localeCompare(b.student?.student_no ?? ""),
  );

  // submissions는 버전 내림차순이므로 학생별 첫 번째가 최신 제출이다.
  const latest = new Map<string, Submission>();
  const versions = new Map<string, number>();
  for (const s of submissions) {
    if (!latest.has(s.student_id)) latest.set(s.student_id, s);
    versions.set(s.student_id, (versions.get(s.student_id) ?? 0) + 1);
  }

  const submitted = members.filter((m) => latest.has(m.student_id) && !latest.get(m.student_id)!.canceled_at);
  const late = submitted.filter((m) => latest.get(m.student_id)?.is_late).length;
  const missing = members.length - submitted.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="제출" value={submitted.length - late} />
        <Stat label="마감 후 제출" value={late} />
        <Stat label="미제출" value={missing} />
      </div>

      {members.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          아직 참여한 학생이 없어요.
        </p>
      )}

      {members.map((m) => {
        const s = latest.get(m.student_id);
        return (
          <Card key={m.student_id} size="sm">
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{m.student?.student_no}</span>
                <span className="font-medium">{m.student?.name}</span>
                {aiCounts[m.student_id]>0 && <span className="text-xs text-muted-foreground">AI 초안 요청 {aiCounts[m.student_id]}회</span>}
                <span className="ml-auto">
                  {!s || s.canceled_at ? (
                    <Badge variant="secondary">미제출</Badge>
                  ) : (
                    <Badge variant={s.is_late ? "outline" : "default"}>
                      {s.is_late ? "마감 후 제출" : "제출"}
                    </Badge>
                  )}
                </span>
              </div>
              {s && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(s.submitted_at)}
                    {(versions.get(m.student_id) ?? 1) > 1 && ` · ${versions.get(m.student_id)}번 제출`}
                  </p>
                  <SubmissionBody submission={s} />
                  {feedbackReady && <FeedbackForm submissionId={s.id} body={feedback[s.id]?.body ?? ""} />}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function SubmissionItem({ submission: s }: { submission: Submission }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{s.version > 1 ? `${s.version}번째 제출` : "제출"}</span>
          <span className="text-muted-foreground">{formatDateTime(s.submitted_at)}</span>
          {s.canceled_at && <Badge variant="secondary">취소됨 · {formatDateTime(s.canceled_at)}</Badge>}
          {s.is_late && <Badge variant="outline">마감 후 제출</Badge>}
        </div>
        <SubmissionBody submission={s} />
      </CardContent>
    </Card>
  );
}

// 파일은 5분짜리 임시 링크로만 내려받는다. (SEC-03)
function SubmissionBody({ submission: s }: { submission: Submission }) {
  if (s.file_path) {
    return (
      <a
        href={`/submissions/${s.id}/download`}
        className="text-sm font-medium underline underline-offset-4"
      >
        {s.file_name}
        {s.file_size ? ` (${formatFileSize(s.file_size)})` : ""}
      </a>
    );
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        글 보기 ({countChars(s.content ?? "")}자)
      </summary>
      <p className="mt-2 rounded-lg bg-muted p-3 whitespace-pre-wrap">{s.content}</p>
    </details>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-sm whitespace-pre-wrap">{text}</p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function FeedbackBody({feedback}:{feedback:Feedback}) { return <div className="rounded-lg border border-primary/20 bg-accent/30 p-4"><p className="text-sm font-semibold">선생님 피드백</p><p className="mt-2 whitespace-pre-wrap text-sm">{feedback.body}</p><p className="mt-2 text-xs text-muted-foreground">{formatDateTime(feedback.updated_at)}</p></div>; }
