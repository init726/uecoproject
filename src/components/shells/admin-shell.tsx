import { FileSpreadsheet, LayoutDashboard, Server, User, UserCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { NavLink } from "@/components/shells/nav-link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard, exact: true },
  { href: "/admin/approvals", label: "교사 승인", icon: UserCheck },
  { href: "/admin/accounts/new", label: "계정 발급", icon: UserPlus },
  { href: "/admin/accounts/bulk", label: "학생 단체 발급", icon: FileSpreadsheet },
  { href: "/admin/users", label: "사용자 관리", icon: Users },
  { href: "/admin/system", label: "시스템", icon: Server },
];

const ITEM =
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground data-active:bg-primary/15 data-active:text-primary";

// 관리자 및 개발자 화면: 어두운 콘솔
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
    <div data-role="admin" className="dark flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Link href="/admin" className="font-mono text-sm font-bold tracking-tight">
            우리학교 <span className="text-primary">console</span>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map(({ href, label, icon: Icon, exact }) => (
            <NavLink key={href} href={href} exact={exact} className={ITEM}>
              <Icon className="size-4" />
              {label}
              {href === "/admin/approvals" && pendingBadge}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <NavLink href="/me" className={ITEM}>
            <User className="size-4" />
            <span className="truncate">{profile.name}</span>
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <span className="shrink-0 font-mono text-sm font-bold">console</span>
          {NAV.map(({ href, label, exact }) => (
            <NavLink key={href} href={href} exact={exact} className={`${ITEM} shrink-0`}>
              {label}
            </NavLink>
          ))}
          <NavLink href="/me" className={`${ITEM} shrink-0`}>
            내 정보
          </NavLink>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>
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
