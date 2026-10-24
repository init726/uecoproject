import { House, ListTodo, MessagesSquare, User } from "lucide-react";
import Link from "next/link";
import { NavLink } from "@/components/shells/nav-link";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/home", label: "홈", icon: House },
  { href: "/todo", label: "할 일", icon: ListTodo },
  { href: "/community", label: "커뮤니티", icon: MessagesSquare },
  { href: "/me", label: "내 정보", icon: User },
];

// 학생 화면: 휴대폰에서 쓰기 좋게 아래쪽 탭, 큰 화면에서는 위쪽 메뉴
export function StudentShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return (
    <div data-role="student" className="flex min-h-screen flex-col bg-accent/40">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <Link href="/home" className="text-lg font-bold text-primary">
            우리학교
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {NAV.map(({ href, label }) => (
              <NavLink
                key={href}
                href={href}
                className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent data-active:bg-primary data-active:text-primary-foreground"
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <span className="ml-auto text-sm text-muted-foreground">
            {profile.student_no} {profile.name}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-24 sm:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground data-active:text-primary"
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
