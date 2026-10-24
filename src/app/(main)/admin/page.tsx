import Link from "next/link";
import { MissingKey } from "@/components/admin/missing-key";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

type ProfileRow = { id: string; name: string; role: Role; approved: boolean; created_at: string };

// 관리자 대시보드: 학교 전체 숫자만 본다. (제출물 내용은 관리자도 볼 수 없다)
export default async function AdminDashboardPage() {
  if (!hasAdminKey()) {
    await requireAdmin();
    return <MissingKey />;
  }

  const admin = createAdminClient();
  const count = (table: string) =>
    admin.from(table).select("*", { count: "exact", head: true }).then((r) => r.count ?? 0);

  // 관리자 확인과 조회를 동시에 시작한다. 관리자가 아니면 requireAdmin이 이동시켜서 결과는 화면에 나가지 않는다.
  const [, { data: profileRows }, classes, assignments, submissions, enrollments] = await Promise.all([
    requireAdmin(),
    admin
      .from("profiles")
      .select("id, name, role, approved, created_at")
      .order("created_at", { ascending: false })
      .overrideTypes<ProfileRow[], { merge: false }>(),
    count("classes"),
    count("assignments"),
    count("submissions"),
    count("enrollments"),
  ]);
  const profiles = profileRows ?? [];
  const pending = profiles.filter((p) => p.role === "teacher" && !p.approved).length;

  const stats = [
    { label: "학생", value: profiles.filter((p) => p.role === "student").length },
    { label: "교사", value: profiles.filter((p) => p.role === "teacher" && p.approved).length },
    { label: "관리자", value: profiles.filter((p) => p.role === "admin").length },
    { label: "클래스", value: classes },
    { label: "수강 신청", value: enrollments },
    { label: "과제", value: assignments },
    { label: "제출", value: submissions },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-mono text-xl font-bold">대시보드</h2>

      {pending > 0 && (
        <Link
          href="/admin/approvals"
          className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm hover:bg-primary/15"
        >
          승인을 기다리는 교사가 <b className="text-primary">{pending}명</b> 있어요 →
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="font-mono text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">최근 가입</h3>
        <div className="divide-y rounded-lg border">
          {profiles.slice(0, 8).map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <Badge variant="outline">{ROLE_LABEL[p.role]}</Badge>
              <span>{p.name}</span>
              {p.role === "teacher" && !p.approved && <Badge>승인 대기</Badge>}
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {formatDateTime(p.created_at)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
