import { withSchemaFallback } from "@/lib/schema-compat";
import { TeacherDashboard, type TeacherDashboardClass } from "@/components/home/dashboard";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function TeacherHome({ profile, semester, semesterControl }: { profile: Profile; semester: string; semesterControl?: React.ReactNode }) {
  const supabase = await createClient();

  // 클래스·수강생·과제·제출을 한 번의 요청으로 가져온다. (여러 번 왕복하지 않도록)
  const { data, error } = await withSchemaFallback<TeacherDashboardClass[]>(extended => supabase
    .from("classes")
    .select(
      `id, name, room, semester, import_key, class_slots(day, period), enrollments(student_id), assignments(id, title, due_at, class_id, submissions(student_id, version${extended ? ", canceled_at" : ""}))`,
    )
    .eq("teacher_id", profile.id)
    .eq("semester", semester)
    .order("name")
    .overrideTypes<TeacherDashboardClass[], { merge: false }>(), ["canceled_at"]);
  if (error) throw new Error("수업을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  const classes = data ?? [];

  return <TeacherDashboard profile={profile} semester={semester} classes={classes} semesterControl={semesterControl} />;
}
