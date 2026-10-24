import Link from "next/link";
import { notFound } from "next/navigation";
import { leaveClass } from "@/app/(main)/classes/actions";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProfile } from "@/lib/auth";
import { formatDateTime, formatSlots, isPast } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Assignment, ClassRow, ClassSlot, Notice } from "@/lib/types";
import { deleteNotice, regenerateInviteCode, removeStudent } from "./actions";

type ClassDetail = ClassRow & {
  class_slots: ClassSlot[];
  teacher: { name: string } | null;
};

type AssignmentWithSubmissions = Assignment & {
  submissions: { student_id: string; is_late: boolean; version: number }[];
};

type Member = {
  student_id: string;
  joined_at: string;
  student: { name: string; student_no: string | null } | null;
};

const TABS = ["assignments", "notices", "students"] as const;

export default async function ClassPage(props: PageProps<"/classes/[classId]">) {
  const { classId } = await props.params;
  const { tab } = await props.searchParams;
  const supabase = await createClient();

  // 필요한 조회를 한꺼번에 동시에 보낸다. (하나씩 기다리면 그만큼 느려진다)
  // RLS: 담당 교사나 참여 학생이 아니면 클래스가 null로 돌아온다.
  // 제출물은 교사에게는 반 전체, 학생에게는 자기 것만 들어 있다.
  const [profile, { data: klass }, { data: assignmentRows }, { data: noticeRows }, { data: memberRows }] =
    await Promise.all([
      getProfile(),
      supabase
        .from("classes")
        .select("id, teacher_id, name, semester, room, invite_code, class_slots(day, period), teacher:profiles!classes_teacher_id_fkey(name)")
        .eq("id", classId)
        .maybeSingle<ClassDetail>(),
      supabase
        .from("assignments")
        .select("id, class_id, title, description, rubric, due_at, type, max_chars, allow_late, submissions(student_id, is_late, version)")
        .eq("class_id", classId)
        .order("due_at", { ascending: false })
        .overrideTypes<AssignmentWithSubmissions[], { merge: false }>(),
      supabase
        .from("notices")
        .select("id, title, body, created_at")
        .eq("class_id", classId)
        .order("created_at", { ascending: false })
        .overrideTypes<Notice[], { merge: false }>(),
      supabase
        .from("enrollments")
        .select("student_id, joined_at, student:profiles!enrollments_student_id_fkey(name, student_no)")
        .eq("class_id", classId)
        .overrideTypes<Member[], { merge: false }>(),
    ]);
  if (!klass) notFound();

  const isTeacher = klass.teacher_id === profile.id;
  const assignments = assignmentRows ?? [];
  const notices = noticeRows ?? [];
  // 학생에게는 enrollments가 자기 한 줄만 오므로 학생 목록은 교사에게만 쓴다.
  const members = isTeacher
    ? (memberRows ?? []).sort((a, b) => (a.student?.student_no ?? "").localeCompare(b.student?.student_no ?? ""))
    : [];

  // 과제별로 학생마다 가장 최근 제출의 지각 여부
  const latestByAssignment = new Map<string, Map<string, boolean>>();
  for (const a of assignments) {
    const latest = new Map<string, { version: number; late: boolean }>();
    for (const s of a.submissions) {
      const prev = latest.get(s.student_id);
      if (!prev || s.version > prev.version) latest.set(s.student_id, { version: s.version, late: s.is_late });
    }
    latestByAssignment.set(a.id, new Map([...latest].map(([id, v]) => [id, v.late])));
  }

  const defaultTab = TABS.find((t) => t === tab) ?? "assignments";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">{klass.name}</h2>
        <p className="text-sm text-muted-foreground">
          {[
            klass.semester,
            formatSlots(klass.class_slots),
            klass.room,
            klass.teacher ? `${klass.teacher.name} 선생님` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {isTeacher && (
        <Card size="sm">
          <CardContent className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-xs text-muted-foreground">초대코드</p>
              <p className="font-mono text-2xl font-bold tracking-[0.3em]">{klass.invite_code}</p>
            </div>
            <form action={regenerateInviteCode.bind(null, classId)}>
              <SubmitButton variant="outline" size="sm" pendingText="재발급 중...">
                재발급
              </SubmitButton>
            </form>
            <div className="ml-auto flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/classes/${classId}/notices/new`}>공지 쓰기</Link>
              </Button>
              <Button asChild>
                <Link href={`/classes/${classId}/assignments/new`}>과제 내기</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="assignments">과제 {assignments.length}</TabsTrigger>
          <TabsTrigger value="notices">공지 {notices.length}</TabsTrigger>
          {isTeacher && <TabsTrigger value="students">학생 {members.length}</TabsTrigger>}
        </TabsList>

        <TabsContent value="assignments" className="mt-3 flex flex-col gap-2">
          {assignments.length === 0 && <Empty text="아직 과제가 없어요." />}
          {assignments.map((a) => {
            const submitted = latestByAssignment.get(a.id);
            const myLate = submitted?.get(profile.id);
            const overdue = isPast(a.due_at);
            return (
              <Link key={a.id} href={`/assignments/${a.id}`}>
                <Card size="sm" className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{a.type === "file" ? "파일" : "글"}</Badge>
                        <span className="truncate font-medium">{a.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        마감 {formatDateTime(a.due_at)}
                      </p>
                    </div>
                    {isTeacher ? (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        제출 {submitted?.size ?? 0}/{members.length}
                      </span>
                    ) : myLate === undefined ? (
                      <Badge variant={overdue ? "destructive" : "secondary"}>미제출</Badge>
                    ) : (
                      <Badge variant={myLate ? "destructive" : "default"}>
                        {myLate ? "지각 제출" : "제출 완료"}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </TabsContent>

        <TabsContent value="notices" className="mt-3 flex flex-col gap-2">
          {notices.length === 0 && <Empty text="아직 공지가 없어요." />}
          {notices.map((n) => (
            <Card key={n.id} size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                  </div>
                  {isTeacher && (
                    <form action={deleteNotice.bind(null, classId, n.id)}>
                      <SubmitButton variant="ghost" size="xs" pendingText="삭제 중...">
                        삭제
                      </SubmitButton>
                    </form>
                  )}
                </div>
                {n.body && <p className="text-sm whitespace-pre-wrap">{n.body}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {isTeacher && (
          <TabsContent value="students" className="mt-3">
            {members.length === 0 ? (
              <Empty text="아직 참여한 학생이 없어요. 초대코드를 알려주세요." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학번</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead className="hidden sm:table-cell">참여일</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.student_id}>
                      <TableCell>{m.student?.student_no}</TableCell>
                      <TableCell>{m.student?.name}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {formatDateTime(m.joined_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={removeStudent.bind(null, classId, m.student_id)}>
                          <SubmitButton variant="ghost" size="xs" pendingText="내보내는 중...">
                            내보내기
                          </SubmitButton>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        )}
      </Tabs>

      {!isTeacher && (
        <form action={leaveClass.bind(null, classId)} className="self-end">
          <SubmitButton variant="ghost" size="sm" className="text-muted-foreground" pendingText="나가는 중...">
            클래스 나가기
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
