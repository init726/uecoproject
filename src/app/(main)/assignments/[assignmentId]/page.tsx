import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { countChars, formatDateTime, formatFileSize, isPast } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Assignment, Submission } from "@/lib/types";
import { FileSubmitForm } from "./file-submit-form";
import { TextSubmitForm } from "./text-submit-form";

type Member = {
  student_id: string;
  student: { name: string; student_no: string | null } | null;
};

type AssignmentDetail = Assignment & {
  class: { id: string; name: string; teacher_id: string; enrollments: Member[] } | null;
};

const SUBMISSION_COLUMNS =
  "id, assignment_id, student_id, version, file_path, file_name, file_size, content, submitted_at, is_late";

export default async function AssignmentPage(props: PageProps<"/assignments/[assignmentId]">) {
  const { assignmentId } = await props.params;
  const supabase = await createClient();

  // 프로필, 과제(+반 학생 명단), 제출물을 동시에 가져온다.
  // RLS: 학생에게는 자기 제출물과 자기 수강 정보만, 담당 교사에게는 반 전체가 돌아온다.
  const [profile, { data: assignment }, { data: submissionRows }] = await Promise.all([
    getProfile(),
    supabase
      .from("assignments")
      .select(
        "id, class_id, title, description, rubric, due_at, type, max_chars, allow_late, class:classes(id, name, teacher_id, enrollments(student_id, student:profiles!enrollments_student_id_fkey(name, student_no)))",
      )
      .eq("id", assignmentId)
      .maybeSingle<AssignmentDetail>(),
    supabase
      .from("submissions")
      .select(SUBMISSION_COLUMNS)
      .eq("assignment_id", assignmentId)
      .order("version", { ascending: false })
      .overrideTypes<Submission[], { merge: false }>(),
  ]);
  if (!assignment?.class) notFound();
  const submissions = submissionRows ?? [];

  const isTeacher = assignment.class.teacher_id === profile.id;
  const overdue = isPast(assignment.due_at);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/classes/${assignment.class.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {assignment.class.name}
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{assignment.type === "file" ? "파일" : "글"}</Badge>
          <h2 className="text-xl font-bold">{assignment.title}</h2>
        </div>
        <p className={overdue ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          마감 {formatDateTime(assignment.due_at)}
          {overdue && " (마감됨)"}
          {" · "}
          {assignment.allow_late ? "마감 후 제출 가능(지각 표시)" : "마감 후 제출 불가"}
          {assignment.max_chars && ` · ${assignment.max_chars}자 이내`}
        </p>
      </div>

      {(assignment.description || assignment.rubric) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {assignment.description && (
            <InfoCard title="설명" text={assignment.description} />
          )}
          {assignment.rubric && <InfoCard title="평가 기준" text={assignment.rubric} />}
        </div>
      )}

      {isTeacher ? (
        <TeacherView members={assignment.class.enrollments} submissions={submissions} />
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
                  maxChars={assignment.max_chars ?? 10000}
                  lastSubmitted={submissions[0]?.content ?? null}
                />
              )}
            </CardContent>
          </Card>

          {submissions.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">내 제출 기록</h3>
              <p className="text-xs text-muted-foreground">
                제출 기록은 고치거나 지울 수 없어요. 제출 시각은 서버 시간으로 기록돼요.
              </p>
              {submissions.map((s) => (
                <SubmissionItem key={s.id} submission={s} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ASG-05: 교사용 제출 현황 (제출 / 지각 / 미제출)
function TeacherView({ members: memberRows, submissions }: { members: Member[]; submissions: Submission[] }) {
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

  const submitted = members.filter((m) => latest.has(m.student_id));
  const late = submitted.filter((m) => latest.get(m.student_id)?.is_late).length;
  const missing = members.length - submitted.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="제출" value={submitted.length - late} />
        <Stat label="지각" value={late} />
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
                <span className="ml-auto">
                  {!s ? (
                    <Badge variant="secondary">미제출</Badge>
                  ) : (
                    <Badge variant={s.is_late ? "destructive" : "default"}>
                      {s.is_late ? "지각" : "제출"}
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
          <span className="font-medium">{s.version}번째 제출</span>
          <span className="text-muted-foreground">{formatDateTime(s.submitted_at)}</span>
          {s.is_late && <Badge variant="destructive">지각</Badge>}
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
