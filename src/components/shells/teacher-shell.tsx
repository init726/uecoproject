import { BookOpen, LayoutDashboard, MessageSquare, Plus, User } from "lucide-react";
import { NotificationLink } from "@/components/notification-link";
import Link from "next/link";
import { Suspense } from "react";
import { NavLink } from "@/components/shells/nav-link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { SchoolBrand } from "@/components/school-brand";
import { ThemeToggle } from "@/components/theme-toggle";

const ITEM = "school-nav-item";

// 교사 화면: 왼쪽 사이드바에 내 클래스 목록. 휴대폰에서는 위쪽 가로 메뉴.
export function TeacherShell({
  profile,
  classLinks,
  children,
}: {
  profile: Profile;
  classLinks: React.ReactNode; // 내 클래스 목록. 늦게 도착해도 화면이 먼저 뜨도록 따로 받는다.
  children: React.ReactNode;
}) {
  return (
    <div data-role="teacher" className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-[4.5rem] items-center border-b px-5">
          <SchoolBrand subtitle="교직원 공간" />
        </div>
        <nav aria-label="교사 주 메뉴" className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          <Suspense fallback={null}><NotificationLink /></Suspense>
          <NavLink href="/home" exact className={ITEM}>
            <LayoutDashboard className="size-4" />
            대시보드
          </NavLink>
          <NavLink href="/community" className={ITEM}>
            <MessageSquare className="size-4" />
            커뮤니티
          </NavLink>
          <p className="mt-6 mb-2 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground">담당 수업</p>
          {classLinks}
          <NavLink href="/classes/new" exact className={ITEM}>
            <Plus className="size-4" />
            클래스 만들기
          </NavLink>
        </nav>
        <div className="flex items-center gap-2 border-t p-4">
          <NavLink href="/me" className={`${ITEM} flex-1`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-school-navy">{profile.name.slice(0, 1)}</span>
            <span className="min-w-0"><span className="block truncate font-medium text-foreground">{profile.name} 선생님</span><span className="block text-xs">{profile.subject} · 내 정보</span></span>
          </NavLink>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="school-topbar flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:hidden">
          <SchoolBrand tone="light" subtitle="교직원" />
          <div className="flex min-w-0 items-center gap-3">
            <Suspense fallback={null}><NotificationLink compact /></Suspense>
            <Link href="/me" className="min-w-0 rounded-sm text-right">
              <span className="block truncate text-sm font-bold">{profile.name} 선생님</span>
              <span className="block text-xs text-muted-foreground">{profile.subject}</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>
        <nav aria-label="모바일 교사 메뉴" className="school-bottom-nav grid-cols-4 lg:hidden">
          <NavLink href="/home" exact className="school-bottom-link"><LayoutDashboard className="size-5" />홈</NavLink>
          <NavLink href="/community" className="school-bottom-link"><MessageSquare className="size-5" />커뮤니티</NavLink>
          <NavLink href="/classes/new" exact className="school-bottom-link"><Plus className="size-5" />클래스 만들기</NavLink>
          <NavLink href="/me" className="school-bottom-link"><User className="size-5" />내 정보</NavLink>
        </nav>
      </div>
    </div>
  );
}

// 사이드바의 내 클래스 목록 (Suspense 안에서 따로 불러온다)
export async function TeacherClassLinks({ teacherId }: { teacherId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("classes").select("id, name, semester").eq("teacher_id", teacherId).order("semester", { ascending: false }).order("name");
  return (data ?? []).map((c) => (
    <NavLink key={c.id} href={`/classes/${c.id}`} className={ITEM}>
      <BookOpen className="size-4" />
      <span className="min-w-0"><span className="block truncate">{c.name}</span><span className="block text-[11px] text-muted-foreground">{c.semester}</span></span>
    </NavLink>
  ));
}

export function ClassLinksSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2 px-3 py-1">
      <div className="h-4 w-28 rounded bg-muted" />
      <div className="h-4 w-20 rounded bg-muted" />
    </div>
  );
}
