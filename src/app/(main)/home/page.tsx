import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { StudentHome } from "./student-home";
import { TeacherHome } from "./teacher-home";
import { getSemesters, selectSemester } from "@/lib/semesters";
import { SemesterFilter } from "@/components/semester-filter";

// 같은 /home 주소라도 계정 종류마다 다른 화면을 보여준다.
export default async function HomePage(props: PageProps<"/home">) {
  const profile = await getProfile();
  if (profile.role === "admin") redirect("/admin");
  const [semesters, params] = await Promise.all([getSemesters(), props.searchParams]);
  const semester = selectSemester(semesters, typeof params.semester === "string" ? params.semester : undefined);
  const semesterControl = <SemesterFilter semesters={semesters} selected={semester} />;
  return profile.role === "teacher" ? <TeacherHome profile={profile} semester={semester} semesterControl={semesterControl} />
    : <StudentHome profile={profile} semester={semester} semesterControl={semesterControl} />;
}
