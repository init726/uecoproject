import { House, ListTodo, User } from "lucide-react";
import { Suspense } from "react";
import { NotificationLink } from "@/components/notification-link";
import Link from "next/link";
import { NavLink } from "@/components/shells/nav-link";
import type { Profile } from "@/lib/types";
import { SchoolBrand } from "@/components/school-brand";

const NAV = [
  { href: "/home", label: "홈", icon: House },
  { href: "/todo", label: "할 일", icon: ListTodo },
  { href: "/me", label: "내 정보", icon: User },
];

// 학생 화면: 휴대폰에서 쓰기 좋게 아래쪽 탭, 큰 화면에서는 위쪽 메뉴
export function StudentShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return (
    <div data-role="student" className="flex min-h-screen flex-col bg-background">
      <header className="school-topbar">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <SchoolBrand tone="light" subtitle="" />
          <nav aria-label="주 메뉴" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(({ href, label }) => (
              <NavLink key={href} href={href} className="school-top-link">
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto"><Suspense fallback={null}><NotificationLink /></Suspense></div>
          <Link href="/me" className="min-w-0 rounded-sm text-right focus-visible:outline-white">
            <span className="block truncate text-sm font-semibold">{profile.name}</span>
            <span className="block text-xs text-white/80">{profile.student_no} · 학생</span>
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 md:pt-8 md:pb-12 lg:px-8">{children}</main>

      <nav aria-label="모바일 주 메뉴" className="school-bottom-nav md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            href={href}
            className="school-bottom-link"
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
