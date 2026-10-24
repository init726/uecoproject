import { CalendarDays, FileSpreadsheet, LayoutDashboard, Server, User, UserCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { NavLink } from "@/components/shells/nav-link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { SchoolBrand } from "@/components/school-brand";

const NAV = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard, exact: true },
  { href: "/admin/approvals", label: "교사 승인", icon: UserCheck },
  { href: "/admin/accounts/new", label: "계정 발급", icon: UserPlus },
  { href: "/admin/accounts/bulk", label: "학생 단체 발급", icon: FileSpreadsheet },
  { href: "/admin/import", label: "엑셀 시간표 등록", icon: CalendarDays },
  { href: "/admin/users", label: "사용자 관리", icon: Users },
  { href: "/admin/recovery", label: "계정 복구 요청", icon: UserCheck },
  { href: "/admin/surveys", label: "설문 결과", icon: CalendarDays },
  { href: "/admin/system", label: "시스템", icon: Server },
];

const ITEM = "school-nav-item";

// 관리자 공간도 학교 포털의 공통 색상과 메뉴 규칙을 사용한다.
export function AdminShell({
  profile,
  pendingBadge,
  children,
}: {
  profile: Profile;
  pendingBadge: React.ReactNode; // 승인 대기 수. 늦게 도착해도 화면이 먼저 뜨도록 따로 받는다.
  children: React.ReactNode;
}) {
  return (
    <div data-role="admin" className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-t-[3px] border-t-primary border-r bg-sidebar lg:flex">
        <div className="flex h-[4.5rem] items-center border-b px-5">
          <SchoolBrand href="/admin" subtitle="학교 관리 공간" />
        </div>
        <nav aria-label="관리자 주 메뉴" className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {NAV.map(({ href, label, icon: Icon, exact }) => (
            <NavLink key={href} href={href} exact={exact} className={ITEM}>
              <Icon className="size-4" />
              {label}
              {href === "/admin/approvals" && pendingBadge}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <NavLink href="/me" className={ITEM}>
            <User className="size-4" />
            <span className="truncate">{profile.name}</span>
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="school-topbar lg:hidden">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <SchoolBrand href="/admin" tone="light" subtitle="관리자" />
            <Link href="/me" className="min-w-0 rounded-sm text-right focus-visible:outline-white">
              <span className="block truncate text-sm font-semibold">{profile.name}</span>
              <span className="block text-xs text-white/80">내 정보</span>
            </Link>
          </div>
          <nav aria-label="모바일 관리자 메뉴" className="flex gap-1 overflow-x-auto px-3 pb-3 sm:px-5">
            {NAV.map(({ href, label, exact }) => (
              <NavLink key={href} href={href} exact={exact} className="school-top-link h-9 px-3.5 text-sm">
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

// 승인 대기 교사 수 배지 (Suspense 안에서 따로 불러온다)
export async function PendingTeacherBadge() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "teacher")
    .eq("approved", false);
  if (!count) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
      {count}
    </span>
  );
}
