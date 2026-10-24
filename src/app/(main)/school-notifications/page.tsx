import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { isMissingSchema } from "@/lib/schema-compat";
import { ReadForm } from "./read-form";

export default async function Notifications() {
  const profile = await getProfile();
  const client = await createClient();
  const { data, error } = await client.from("learning_notifications")
    .select("id,title,href,read_at,created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const unavailable = isMissingSchema(error, ["learning_notifications"]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="page-title">학교 알림</h2>
        {!error && Boolean(data?.length) && <ReadForm />}
      </div>
      <p className="text-xs text-muted-foreground">최근 알림 100개를 표시합니다. 과제 마감은 홈과 할 일에서 확인하세요.</p>
      {error ? (
        <section className="school-panel space-y-3 p-5" role="status">
          <p className="text-sm font-medium">{unavailable ? "학교 알림을 준비하고 있습니다." : "알림을 불러오지 못했습니다."}</p>
          <p className="text-sm text-muted-foreground">
            {unavailable ? "지금은 홈에서 수업과 과제를 확인해 주세요." : "잠시 후 다시 시도해 주세요. 수업과 과제는 홈에서 확인할 수 있습니다."}
          </p>
          <Link href="/home" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline">홈으로 이동</Link>
        </section>
      ) : (
        <div className="school-panel divide-y">
          {data?.length ? data.map(n => (
            <Link key={n.id} href={/^\/(assignments|classes|surveys)\//.test(n.href) ? n.href : "/home"} className="flex items-start gap-3 p-4 hover:bg-muted/30">
              {!n.read_at && <span aria-label="읽지 않음" className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
              <div>
                <p className="text-sm font-medium">{n.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </div>
            </Link>
          )) : <p className="p-5 text-sm text-muted-foreground">새로운 알림이 없습니다.</p>}
        </div>
      )}
    </div>
  );
}
