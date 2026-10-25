import Link from "next/link";
import { MissingKey } from "@/components/admin/missing-key";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import { displayLoginId } from "@/lib/username";
import { cn } from "@/lib/utils";
import { type UserRow, UsersTable } from "./users-table";
import { PageHeader } from "@/components/page-header";

const ROLE_FILTERS = [
  { value: "all", label: "전체" },
  { value: "student", label: "학생" },
  { value: "teacher", label: "교사" },
  { value: "admin", label: "관리자" },
] as const;

export default async function UsersPage(props: PageProps<"/admin/users">) {
  if (!hasAdminKey()) {
    await requireAdmin();
    return <MissingKey />;
  }

  // 관리자 확인과 조회를 동시에 시작한다.
  // 아이디와 마지막 로그인은 로그인 시스템(auth)에, 이름·역할은 profiles에 있어서 둘을 합친다.
  const admin = createAdminClient();
  const [me, params, { data: profileRows }, { data: authData }] = await Promise.all([
    requireAdmin(),
    props.searchParams as Promise<{ role?: string; grade?: string; q?: string }>,
    admin
      .from("profiles")
      .select("id, name, role, student_no, subject, approved")
      .order("role")
      .order("student_no")
      .order("name")
      .overrideTypes<Profile[], { merge: false }>(),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const role = params.role ?? "all";
  const grade = role === "student" ? (params.grade ?? "") : "";
  const q = params.q ?? "";
  const keyword = q.trim().toLowerCase();

  const authById = new Map(authData?.users.map((u) => [u.id, u]) ?? []);

  const users: UserRow[] = (profileRows ?? [])
    .filter((p) => role === "all" || p.role === role)
    .filter((p) => !grade || p.student_no?.startsWith(grade)) // 학번 첫 자리 = 학년
    .map((p) => {
      const auth = authById.get(p.id);
      return {
        id: p.id,
        role: p.role,
        name: p.name,
        loginId: displayLoginId(auth?.email),
        detail: p.student_no ?? p.subject,
        pending: p.role === "teacher" && !p.approved,
        lastSignIn: auth?.last_sign_in_at ? formatDateTime(auth.last_sign_in_at) : null,
        isMe: p.id === me.id,
      };
    })
    .filter(
      (u) =>
        !keyword ||
        u.name.toLowerCase().includes(keyword) ||
        u.loginId.includes(keyword) ||
        (u.detail ?? "").includes(keyword),
    );

  const href = (next: { role?: string; grade?: string }) => {
    const search = new URLSearchParams({ role: next.role ?? role });
    if (next.grade) search.set("grade", next.grade);
    if (q) search.set("q", q);
    return `/admin/users?${search}`;
  };
  const chip = (active: boolean) =>
    cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted", active && "bg-primary/15 text-primary");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="학교 관리"
        title="사용자 관리"
        actions={
          <Link href="/admin/accounts/bulk" className="text-sm font-semibold text-primary hover:underline">
            학생 단체 발급 →
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {ROLE_FILTERS.map((f) => (
          <Link key={f.value} href={href({ role: f.value })} className={chip(role === f.value)}>
            {f.label}
          </Link>
        ))}
        {role === "student" && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            {["", "1", "2", "3"].map((g) => (
              <Link key={g} href={href({ grade: g })} className={chip(grade === g)}>
                {g ? `${g}학년` : "전 학년"}
              </Link>
            ))}
          </>
        )}
        <form className="ml-auto">
          <input type="hidden" name="role" value={role} />
          {grade && <input type="hidden" name="grade" value={grade} />}
          <label htmlFor="user-search" className="sr-only">이름, 아이디, 학번 검색</label>
          <Input id="user-search" name="q" defaultValue={q} className="w-56" />
        </form>
      </div>

      <p className="text-xs text-muted-foreground">
        {users.length}명 · 졸업생 정리: 학생 → 3학년 → 모두 선택 → &quot;제출 기록·파일까지 함께 삭제&quot;
      </p>
      <UsersTable users={users} />
    </div>
  );
}
