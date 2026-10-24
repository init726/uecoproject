import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { StudentHome } from "./student-home";
import { TeacherHome } from "./teacher-home";

// 같은 /home 주소라도 계정 종류마다 다른 화면을 보여준다.
export default async function HomePage() {
  const profile = await getProfile();
  if (profile.role === "admin") redirect("/admin");
  return profile.role === "teacher" ? (
    <TeacherHome profile={profile} />
  ) : (
    <StudentHome profile={profile} />
  );
}
