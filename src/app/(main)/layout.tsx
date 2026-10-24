import { Suspense } from "react";
import { AdminShell, PendingTeacherBadge } from "@/components/shells/admin-shell";
import { StudentShell } from "@/components/shells/student-shell";
import { ClassLinksSkeleton, TeacherClassLinks, TeacherShell } from "@/components/shells/teacher-shell";
import { getProfile } from "@/lib/auth";

// 로그인한 계정 종류에 따라 화면 틀(색, 메뉴 위치)이 완전히 달라진다.
// 메뉴의 숫자·목록은 Suspense로 감싸서, 그 조회를 기다리지 않고 화면을 먼저 보여준다.
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();

  if (profile.role === "admin") {
    return (
      <AdminShell
        profile={profile}
        pendingBadge={
          <Suspense fallback={null}>
            <PendingTeacherBadge />
          </Suspense>
        }
      >
        {children}
      </AdminShell>
    );
  }

  if (profile.role === "teacher") {
    return (
      <TeacherShell
        profile={profile}
        classLinks={
          <Suspense fallback={<ClassLinksSkeleton />}>
            <TeacherClassLinks teacherId={profile.id} />
          </Suspense>
        }
      >
        {children}
      </TeacherShell>
    );
  }

  return <StudentShell profile={profile}>{children}</StudentShell>;
}
