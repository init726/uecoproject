import { CircleAlert, CircleCheck } from "lucide-react";
import packageJson from "../../../../../package.json";
import { requireAdmin } from "@/lib/auth";
import { smsReady } from "@/lib/sms";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TABLES = ["profiles", "classes", "class_slots", "enrollments", "notices", "assignments", "submissions", "semesters", "submission_feedback", "surveys", "survey_responses", "learning_notifications", "account_recovery_requests", "ai_requests"];

type Check = { label: string; ok: boolean; detail: string };

// DB에 가벼운 요청을 하나 보내 걸린 시간을 잰다.
async function pingDatabase() {
  const supabase = await createClient();
  const started = performance.now();
  const { error } = await supabase.from("profiles").select("id", { head: true, count: "exact" });
  return { ms: Math.round(performance.now() - started), error };
}

// 개발자용 점검 화면. 비밀 값은 절대 화면에 출력하지 않고, 있는지 없는지만 보여준다.
// 로그인 설정 (공개 정보)
async function fetchAuthSettings(url: string, publishableKey: string) {
  return fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishableKey }, cache: "no-store" })
    .then((r) => r.json() as Promise<{ mailer_autoconfirm?: boolean; disable_signup?: boolean }>)
    .catch(() => null);
}

// 저장소와 테이블 행 수 (관리자 키가 있을 때만)
async function loadStorageAndCounts() {
  if (!hasAdminKey()) return { bucket: null, rowCounts: [] as [string, number | null][] };
  const admin = createAdminClient();
  const [{ data: bucket }, rowCounts] = await Promise.all([
    admin.storage.getBucket("submissions"),
    Promise.all(
      TABLES.map(async (t) => {
        const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
        return [t, error ? null : count] as [string, number | null];
      }),
    ),
  ]);
  return { bucket, rowCounts };
}

export default async function SystemPage() {
  await requireAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  // 점검 항목을 모두 동시에 확인한다. (하나씩 기다리면 그만큼 느려진다)
  const [{ ms: pingMs, error: pingError }, authSettings, { bucket, rowCounts }] = await Promise.all([
    pingDatabase(),
    fetchAuthSettings(url, publishableKey),
    loadStorageAndCounts(),
  ]);

  const checks: Check[] = [
    { label: "NEXT_PUBLIC_SUPABASE_URL", ok: Boolean(url), detail: url ? new URL(url).host : "없음" },
    { label: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ok: Boolean(publishableKey), detail: publishableKey ? "설정됨" : "없음" },
    { label: "SUPABASE_SECRET_KEY", ok: hasAdminKey(), detail: hasAdminKey() ? "설정됨 (서버 전용)" : "없음 — 계정 발급 불가" },
    {
      label: "문자 발송 (솔라피)",
      ok: smsReady(),
      detail: smsReady()
        ? `설정됨 · 발신번호 ${process.env.SMS_SENDER?.replace(/(\d{3})\d+(\d{4})/, "$1-****-$2")}`
        : "없음 — SOLAPI_API_KEY, SOLAPI_API_SECRET, SMS_SENDER 필요. 단체 발급 때 문자 없이 진행",
    },
    { label: "DB 연결", ok: !pingError, detail: pingError ? pingError.message : `${pingMs}ms` },
    {
      label: "이메일 인증",
      ok: authSettings?.mailer_autoconfirm === true,
      detail: !authSettings
        ? "확인 실패"
        : authSettings.mailer_autoconfirm
          ? "꺼짐 (가입 즉시 로그인)"
          : "켜짐 — 가입 후 메일 링크를 눌러야 로그인. 데모 전 끄기 권장",
    },
    {
      label: "제출 파일 저장소",
      ok: Boolean(bucket && !bucket.public),
      detail: bucket
        ? `${bucket.public ? "공개 ⚠" : "비공개"} · 최대 ${Math.round((bucket.file_size_limit ?? 0) / 1024 / 1024)}MB`
        : hasAdminKey()
          ? "submissions 버킷 없음 — schema.sql 실행 필요"
          : "관리자 키가 있어야 확인 가능",
    },
  ];

  const versions = [
    ["앱", packageJson.version],
    ["Next.js", packageJson.dependencies.next],
    ["React", packageJson.dependencies.react],
    ["supabase-js", packageJson.dependencies["@supabase/supabase-js"]],
    ["Node.js", process.version],
  ];

  return (
    <div className="flex flex-col gap-6 font-mono">
      <h2 className="text-xl font-bold">시스템</h2>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm text-muted-foreground">상태 점검</h3>
        <div className="divide-y rounded-lg border text-sm">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-3 px-4 py-2">
              {c.ok ? (
                <CircleCheck className="size-4 shrink-0 text-emerald-400" />
              ) : (
                <CircleAlert className="size-4 shrink-0 text-primary" />
              )}
              <span className="w-72 shrink-0 truncate">{c.label}</span>
              <span className="text-muted-foreground">{c.detail}</span>
            </div>
          ))}
        </div>
      </section>

      {rowCounts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm text-muted-foreground">테이블 행 수</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {rowCounts.map(([table, count]) => (
              <div key={table} className="rounded-lg border px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">{table}</p>
                <p className="text-lg font-bold">{count ?? "오류"}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm text-muted-foreground">버전</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {versions.map(([name, version]) => (
            <span key={name} className="rounded-md border px-2 py-1">
              {name} <span className="text-primary">{version}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h3 className="text-muted-foreground">개발 명령어</h3>
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
{`npm run test:db        # DB 보안 규칙(RLS) 테스트
npm run issue-account -- --role admin --name 홍길동 --username hong
                       # 터미널에서 계정 발급 (첫 관리자 만들 때)`}
        </pre>
      </section>
    </div>
  );
}
