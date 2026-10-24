"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ImportAccountResult, SchoolImportResult } from "@/lib/school-import";
import { previewSchoolImport, importAccountBatch, finishSchoolImport, type SchoolImportPreview } from "./actions";

function downloadResults(rows: ImportAccountResult[]) {
  const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  const data = [["역할", "이름", "아이디", "임시 비밀번호", "처리", "오류"], ...rows.map((r) => [
    r.role === "teacher" ? "교사" : "학생", r.name, r.username, r.password ?? "",
    r.status === "created" ? "신규 발급" : r.status === "existing" ? "기존 계정 유지" : "실패", r.error ?? "",
  ])].map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "학교계정_발급결과.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export function SchoolImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SchoolImportPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<ImportAccountResult[]>([]);
  const [done, setDone] = useState<SchoolImportResult | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const hasPasswords = results.some((r) => r.password);

  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError(""); setPreview(null);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await previewSchoolImport(form);
      if (response.error) setError(response.error);
      else setPreview(response.preview!);
    } catch { setError("파일 검토 중 연결이 끊겼습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true); setError(""); setDone(null);
    const collected = new Map(results.map((r) => [r.username, r]));
    const total = preview.plan.students.length + preview.plan.teachers.length;
    try {
      for (let offset = 0; offset < total; offset += 10) {
        setProgress(`계정 확인·발급 ${offset}/${total}명`);
        const response = await importAccountBatch(preview.token, offset);
        if (response.error) throw new Error(response.error);
        for (const row of response.results!) {
          // 재시도에서 기존 계정으로 돌아와도 앞서 받은 비밀번호는 화면에 유지한다.
          if (!collected.get(row.username)?.password) collected.set(row.username, row);
          if (row.password) setDownloaded(false);
        }
        setResults([...collected.values()]);
        if (response.results!.some((r) => r.status === "failed")) throw new Error("일부 계정 발급에 실패했습니다. 결과를 저장하고 다시 시도해 주세요.");
      }
      setProgress("클래스·수업 시간·수강생 저장 중");
      const response = await finishSchoolImport(preview.token);
      if (response.error) throw new Error(response.error);
      setDone(response.result!);
    } catch (e) { setError(e instanceof Error ? e.message : "연결이 끊겼습니다. 발급 결과를 저장한 뒤 다시 검토해 주세요."); }
    finally { setProgress(""); setBusy(false); }
  }

  return <div className="flex flex-col gap-6">
    <form onSubmit={review} className="surface flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="school-workbook">계정·시간표 엑셀 파일</Label>
        <Input id="school-workbook" type="file" accept=".xlsx" disabled={busy || results.length > 0}
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError(""); }} required />
      </div>
      <p className="text-sm text-muted-foreground">학생계정 · 교사계정 · 개설클래스 · 수강신청 시트가 필요합니다. 최대 900KB.</p>
      <Button type="submit" disabled={!file || busy} className="self-start">{busy && !preview ? "검토 중..." : "파일 검토"}</Button>
    </form>

    {error && <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm whitespace-pre-wrap text-destructive">{error}</div>}

    {preview && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="학생" value={preview.plan.students.length} /><Stat label="교사" value={preview.plan.teachers.length} />
        <Stat label="클래스" value={preview.plan.classes.length} /><Stat label="수강 신청" value={preview.plan.enrollments.length} />
      </div>
      <div className="surface flex flex-col gap-2 p-5 text-sm">
        <h3 className="font-semibold">{preview.plan.semester} 등록 내용</h3>
        <p>새 계정 {preview.newAccounts}명 · 기존 계정 {preview.existing}명</p>
        <p className="text-muted-foreground">기존 계정의 비밀번호와 제출물은 변경하지 않습니다. 새 계정은 첫 로그인 때 비밀번호를 변경해야 합니다.</p>
        <p className="text-muted-foreground">엑셀의 임시 비밀번호는 사용하지 않습니다. 새 비밀번호는 등록 결과 CSV에서 확인합니다. 성별과 전화번호는 가져오지 않습니다.</p>
        <p className="text-muted-foreground">교사 계정도 함께 발급·승인됩니다. 클래스와 수강생은 모두 검증된 뒤 한 번에 저장합니다. 파일에 없는 기존 수업·수강 신청은 삭제하지 않습니다.</p>
      </div>
      {!!preview.issues.length && <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
        <p className="font-semibold">등록 전에 수정할 항목</p>
        <ul className="mt-2 list-inside list-disc">{preview.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
      </div>}
      <details className="surface p-4"><summary className="cursor-pointer font-medium">클래스와 담당 교사 확인</summary>
        <div className="mt-4 max-h-96 overflow-auto"><table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-card"><tr>{["클래스", "교사", "강의실", "수강생"].map((h) => <th key={h} className="px-2 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{preview.plan.classes.map((c) => <tr key={c.name} className="border-t">
            <td className="px-2 py-3">{c.name}</td><td className="px-2 py-3 whitespace-nowrap">{c.teacherName}</td>
            <td className="px-2 py-3">{c.room}</td><td className="px-2 py-3 whitespace-nowrap">{preview.plan.enrollments.filter((e) => e.className === c.name).length}명</td>
          </tr>)}</tbody>
        </table></div>
      </details>
      {!done && <Button size="lg" onClick={apply} disabled={busy || preview.issues.length > 0} className="self-start">
        {busy ? "등록 중..." : results.length ? "계정 확인 후 등록 다시 시도" : "계정과 시간표 등록"}
      </Button>}
      {progress && <p role="status" className="text-sm text-primary">{progress}</p>}
    </>}

    {done && <div role="status" className="surface border-primary/40 p-5">
      <h3 className="font-semibold text-primary">학교 계정·시간표 등록 완료</h3>
      <p className="mt-2 text-sm">클래스 생성 {done.classes_created}개 · 기존 클래스 연결 {done.classes_reused}개 · 새 수강 신청 {done.enrollments_added}건</p>
      <p className="mt-2 text-sm text-muted-foreground">학생은 개인 시간표와 과제를, 교사는 담당 수업과 수강생 명단을 홈에서 바로 확인할 수 있습니다.</p>
    </div>}

    {results.length > 0 && <section className="surface flex flex-col gap-4 p-5">
      <h3 className="font-semibold">계정 발급 결과</h3>
      <p className="text-sm text-muted-foreground">새 임시 비밀번호는 이 화면에서만 확인할 수 있습니다. CSV를 저장해 개별 전달하세요. 등록이 중단됐어도 발급된 계정은 유지됩니다.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { downloadResults(results); setDownloaded(true); }}>계정 결과 CSV 저장</Button>
        <Button variant="outline" disabled={busy || (hasPasswords && !downloaded)} onClick={() => {
          setPreview(null); setResults([]); setDone(null); setError(""); setDownloaded(false);
        }}>파일 다시 검토</Button>
      </div>
      {hasPasswords && !downloaded && <p className="text-xs text-muted-foreground">CSV를 저장한 뒤 파일을 다시 검토할 수 있습니다.</p>}
      <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm">
        <thead><tr>{["구분", "이름", "아이디", "발급 결과"].map((h) => <th key={h} className="px-2 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{results.map((r) => <tr key={r.username} className="border-t">
          <td className="px-2 py-3">{r.role === "student" ? "학생" : "교사"}</td><td className="px-2 py-3 whitespace-nowrap">{r.name}</td>
          <td className="px-2 py-3 font-mono">{r.username}</td><td className="px-2 py-3">{r.status === "created" ? "신규 발급 · CSV 확인" : r.error ?? "기존 계정 유지"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}
