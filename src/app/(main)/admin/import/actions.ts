"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { issueAccount } from "@/lib/accounts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readSchoolWorkbook } from "@/lib/school-import-xlsx";
import { importAccounts, type SchoolImportPlan, type ImportAccountResult, type SchoolImportResult } from "@/lib/school-import";
import { matchImportAccounts, type DirectoryAccount } from "@/lib/school-import-directory";
import { signSchoolImport, verifySchoolImport } from "@/lib/school-import-token";
import { displayLoginId } from "@/lib/username";

export type SchoolImportPreview = { plan: SchoolImportPlan; token: string; existing: number; newAccounts: number; issues: string[] };
const UPDATE_MESSAGE = "DB 업데이트가 필요합니다. 관리자 담당자가 supabase/update-school-import.sql을 SQL Editor에서 실행한 뒤 파일을 다시 검토해 주세요.";

async function checkReady(semester: string) {
  const client = await createClient();
  const [catalog, classes] = await Promise.all([
    client.from("semesters").select("id").eq("id", semester).maybeSingle(),
    client.from("classes").select("import_key", { head: true }).limit(0),
  ]);
  if (catalog.error || classes.error) throw new Error(UPDATE_MESSAGE);
  if (!catalog.data) throw new Error(`${semester}가 학기 목록에 없습니다. 담당자가 학기를 등록한 뒤 다시 검토해 주세요.`);
}

async function loadDirectory(): Promise<DirectoryAccount[]> {
  const admin = createAdminClient();
  const profiles = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from("profiles").select("id, name, role, student_no, approved").range(offset, offset + 999);
    if (error) throw new Error("기존 사용자 정보를 확인하지 못했습니다.");
    profiles.push(...data);
    if (data.length < 1000) break;
  }
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const accounts: DirectoryAccount[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("기존 계정을 확인하지 못했습니다.");
    for (const user of data.users) {
      const p = byId.get(user.id);
      accounts.push({ id: user.id, email: user.email ?? "", name: p?.name ?? "", role: p?.role ?? "unknown",
        studentNo: p?.student_no ?? null, approved: p?.approved ?? false, importKey: user.app_metadata.school_import_key });
    }
    if (data.users.length < 1000) break;
  }
  return accounts;
}

export async function previewSchoolImport(formData: FormData): Promise<{ preview?: SchoolImportPreview; error?: string }> {
  const me = await requireAdmin();
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || file.size > 900000 || !file.size) {
      return { error: "900KB 이하의 .xlsx 파일을 선택해 주세요." };
    }
    const plan = await readSchoolWorkbook(await file.arrayBuffer());
    await checkReady(plan.semester);
    const matches = matchImportAccounts(plan, await loadDirectory());
    return { preview: { plan, token: signSchoolImport(plan, me.id, process.env.SUPABASE_SECRET_KEY!),
      existing: matches.filter((m) => m.existing).length, newAccounts: matches.filter((m) => !m.existing && !m.error).length,
      issues: matches.flatMap((m) => m.error ? [m.error] : []) } };
  } catch (e) { return { error: e instanceof Error ? e.message : "파일을 검토하지 못했습니다." }; }
}

export async function importAccountBatch(token: string, offset: number): Promise<{ results?: ImportAccountResult[]; error?: string }> {
  const me = await requireAdmin();
  try {
    const plan = verifySchoolImport(token, me.id, process.env.SUPABASE_SECRET_KEY!);
    const accounts = importAccounts(plan);
    if (!Number.isInteger(offset) || offset < 0 || offset >= accounts.length || offset % 10 !== 0) throw new Error("잘못된 발급 순서입니다.");
    await checkReady(plan.semester);
    const matches = matchImportAccounts(plan, await loadDirectory());
    if (matches.some((m) => m.error)) throw new Error(matches.find((m) => m.error)!.error);
    const results: ImportAccountResult[] = [];
    for (const { account, existing } of matches.slice(offset, offset + 10)) {
      const base = { role: account.role, name: account.name, username: account.username };
      if (existing) { results.push({ ...base, username: displayLoginId(existing.email), status: "existing" }); continue; }
      try {
        const result = await issueAccount(account);
        results.push("error" in result ? { ...base, status: "failed", error: result.error }
          : { ...base, status: "created", password: result.password });
      } catch { results.push({ ...base, status: "failed", error: "발급 중 연결이 끊겼습니다. 다시 검토하면 기존 발급 계정을 재사용합니다." }); }
    }
    revalidatePath("/admin", "layout");
    return { results };
  } catch (e) { return { error: e instanceof Error ? e.message : "계정을 발급하지 못했습니다." }; }
}

export async function finishSchoolImport(token: string): Promise<{ result?: SchoolImportResult; error?: string }> {
  const me = await requireAdmin();
  try {
    const plan = verifySchoolImport(token, me.id, process.env.SUPABASE_SECRET_KEY!);
    await checkReady(plan.semester);
    const matches = matchImportAccounts(plan, await loadDirectory());
    const missing = matches.find((m) => m.error || !m.existing);
    if (missing) throw new Error(missing.error ?? `${missing.account.username}: 계정 발급이 완료되지 않았습니다. 다시 시도해 주세요.`);
    const ids = new Map(matches.map((m) => [m.account.username, m.existing!.id]));
    const studentIds = new Map(plan.students.map((s) => [s.studentNo, ids.get(s.username)!]));
    const client = await createClient();
    const { data, error } = await client.rpc("import_school_timetable", {
      p_semester: plan.semester,
      p_classes: plan.classes.map((c) => ({ name: c.name, teacher_id: ids.get(c.teacherUsername), room: c.room, slots: c.slots, capacity: c.capacity })),
      p_enrollments: plan.enrollments.map((e) => ({ student_id: studentIds.get(e.studentNo), class_name: e.className })),
    });
    if (error) throw new Error(error.code === "P0001" ? error.message : "시간표 저장에 실패했습니다. 계정 발급 결과를 저장하고 다시 시도해 주세요.");
    revalidatePath("/", "layout");
    return { result: data as SchoolImportResult };
  } catch (e) { return { error: e instanceof Error ? e.message : "시간표를 저장하지 못했습니다." }; }
}
