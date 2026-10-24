import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { setTeacherApproval } from "../actions";

// AUTH-03: 회원가입한 교사 승인
export default async function ApprovalsPage() {
  const supabase = await createClient();
  const [, { data }] = await Promise.all([
    requireAdmin(),
    supabase
      .from("profiles")
      .select("id, name, role, student_no, subject, approved")
      .eq("role", "teacher")
      .order("approved")
      .order("name")
      .overrideTypes<Profile[], { merge: false }>(),
  ]);
  const teachers = data ?? [];
  const pending = teachers.filter((t) => !t.approved);
  const approved = teachers.filter((t) => t.approved);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xl font-bold">교사 승인 대기 {pending.length}</h2>
        <p className="text-sm text-muted-foreground">
          학교 선생님이 맞는지 확인한 뒤 승인하세요. 거절하면 가입한 계정이 삭제돼요.
        </p>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            승인을 기다리는 교사가 없어요.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {pending.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.subject}</p>
                </div>
                <form action={setTeacherApproval.bind(null, t.id, false)}>
                  <SubmitButton variant="ghost" size="sm" pendingText="거절 중...">
                    거절
                  </SubmitButton>
                </form>
                <form action={setTeacherApproval.bind(null, t.id, true)}>
                  <SubmitButton size="sm" pendingText="승인 중...">
                    승인
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">승인된 교사 {approved.length}</h3>
        <div className="flex flex-wrap gap-2">
          {approved.map((t) => (
            <Badge key={t.id} variant="outline">
              {t.name} · {t.subject}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
