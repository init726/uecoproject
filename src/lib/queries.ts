import type { createClient } from "@/lib/supabase/server";
import type { AssignmentType } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type StudentAssignment = {
  id: string;
  title: string;
  due_at: string;
  type: AssignmentType;
  allow_late: boolean;
  class: { id: string; name: string } | null;
  submitted: boolean;
  is_late: boolean;
};

type Row = Omit<StudentAssignment, "submitted" | "is_late"> & {
  submissions: { is_late: boolean; version: number }[];
};

// 학생이 참여한 모든 클래스의 과제 + 내 제출 여부 (마감 빠른 순)
// 과제와 제출물을 한 번의 요청으로 같이 가져온다. RLS 덕분에 submissions에는 내 제출물만 들어 있다.
export async function getStudentAssignments(supabase: Supabase, semester?: string): Promise<StudentAssignment[]> {
  let query = supabase
    .from("assignments")
    .select("id, title, due_at, type, allow_late, class:classes!inner(id, name), submissions(is_late, version)")
    .order("due_at");
  if (semester) query = query.eq("class.semester", semester);
  const { data, error } = await query.overrideTypes<Row[], { merge: false }>();
  if (error) throw new Error("과제를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");

  return (data ?? []).map(({ submissions, ...a }) => {
    const latest = submissions.reduce<Row["submissions"][number] | null>(
      (best, s) => (!best || s.version > best.version ? s : best),
      null,
    );
    return { ...a, submitted: latest !== null, is_late: latest?.is_late ?? false };
  });
}
