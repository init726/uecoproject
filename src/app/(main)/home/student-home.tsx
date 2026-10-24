import { StudentDashboard, type StudentDashboardClass } from "@/components/home/dashboard";
import { getStudentAssignments } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function StudentHome({ profile, semester, semesterControl }: { profile: Profile; semester: string; semesterControl?: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data, error }, assignments] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, room, semester, class_slots(day, period), teacher:profiles!classes_teacher_id_fkey(name)")
      .eq("semester", semester)
      .order("name")
      .overrideTypes<StudentDashboardClass[], { merge: false }>(),
    getStudentAssignments(supabase, semester),
  ]);
  if (error) throw new Error("수업을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  const classes = data ?? [];
  return <StudentDashboard profile={profile} semester={semester} classes={classes} assignments={assignments} semesterControl={semesterControl} />;
}
