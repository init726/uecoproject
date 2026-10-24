import { BookOpen, LayoutDashboard, Plus, User } from "lucide-react";
import Link from "next/link";
import { NavLink } from "@/components/shells/nav-link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

const ITEM =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground data-active:bg-accent data-active:font-medium data-active:text-accent-foreground";

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
    <div data-role="teacher" className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Link href="/home" className="text-lg font-bold">
            우리학교
          </Link>
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
            교사
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <NavLink href="/home" exact className={ITEM}>
            <LayoutDashboard className="size-4" />
            대시보드
          </NavLink>
          <p className="mt-4 mb-1 px-3 text-xs font-medium text-muted-foreground">내 클래스</p>
          {classLinks}
          <NavLink href="/classes/new" exact className={ITEM}>
            <Plus className="size-4" />
            클래스 만들기
          </NavLink>
        </nav>
        <div className="border-t p-3">
          <NavLink href="/me" className={ITEM}>
            <User className="size-4" />
            <span className="truncate">
              {profile.name} 선생님 · {profile.subject}
            </span>
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <Link href="/home" className="shrink-0 font-bold">
            우리학교
          </Link>
          <NavLink href="/home" exact className={`${ITEM} shrink-0`}>
            대시보드
          </NavLink>
          <NavLink href="/classes/new" exact className={`${ITEM} shrink-0`}>
            클래스 만들기
          </NavLink>
          <NavLink href="/me" className={`${ITEM} shrink-0`}>
            내 정보
          </NavLink>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

// 사이드바의 내 클래스 목록 (Suspense 안에서 따로 불러온다)
export async function TeacherClassLinks({ teacherId }: { teacherId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("classes").select("id, name").eq("teacher_id", teacherId).order("name");
  return (data ?? []).map((c) => (
    <NavLink key={c.id} href={`/classes/${c.id}`} className={ITEM}>
      <BookOpen className="size-4" />
      <span className="truncate">{c.name}</span>
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
