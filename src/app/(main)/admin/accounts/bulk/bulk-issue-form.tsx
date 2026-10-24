"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { defaultStudentUsername, normalizeUsername, validateUsername } from "@/lib/username";
import { type BulkResult, type BulkRow, issueStudentBatch } from "../../actions";

const BATCH_SIZE = 20;

type ParsedRow = BulkRow & { problem?: string };

// 붙여넣은 표(탭 또는 쉼표로 구분)를 행으로 바꾼다. 첫 줄이 제목이면 건너뛴다.
function parse(text: string, year: number): ParsedRow[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,/).map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
    .filter((cells, i) => !(i === 0 && !/^\d+$/.test(cells[0])));

  const seen = new Set<string>();
  return rows.map(([studentNo = "", name = "", phone = "", id = ""]) => {
    const username = normalizeUsername(id || defaultStudentUsername(year, studentNo));
    let problem: string | undefined;
    if (!/^\d{5}$/.test(studentNo)) problem = "학번은 숫자 5자리";
    else if (!name) problem = "이름 없음";
    else problem = validateUsername(username) ?? (seen.has(username) ? "아이디 중복" : undefined);
    seen.add(username);
    return { studentNo, name, phone, username, problem };
  });
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : phone || "-";
}

function downloadCsv(results: BulkResult[]) {
  const escape = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = [
    ["학번", "이름", "아이디", "임시 비밀번호", "문자", "오류"],
    ...results.map((r) => [
      r.studentNo,
      r.name,
      r.username,
      r.password ?? "",
      r.sms === "sent" ? "발송" : r.smsReason ?? "",
      r.error ?? "",
    ]),
  ].map((cells) => cells.map(escape).join(","));
  // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "발급결과.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkIssueForm({ defaultYear, smsReady }: { defaultYear: number; smsReady: boolean }) {
  const [year, setYear] = useState(defaultYear);
  const [text, setText] = useState("");
  const [sendText, setSendText] = useState(smsReady);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const rows = useMemo(() => parse(text, year), [text, year]);
  const valid = rows.filter((r) => !r.problem);

  async function handleIssue() {
    const smsNote = sendText ? " 전화번호가 있는 학생에게 문자를 보내요." : "";
    if (!confirm(`학생 ${valid.length}명의 계정을 발급할까요?${smsNote}`)) return;

    const collected: BulkResult[] = [];
    setProgress({ done: 0, total: valid.length });
    try {
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const batch = valid.slice(i, i + BATCH_SIZE).map(({ studentNo, name, username, phone }) => ({
          studentNo,
          name,
          username,
          phone,
        }));
        collected.push(...(await issueStudentBatch(batch, sendText)));
        setProgress({ done: Math.min(i + BATCH_SIZE, valid.length), total: valid.length });
      }
    } catch {
      // 중간에 끊겨도 그때까지 발급된 결과(비밀번호)는 보여줘야 한다.
      alert(`${collected.length}명까지 발급하고 오류로 멈췄어요. 결과를 저장한 뒤 나머지를 다시 발급하세요.`);
    }
    setResults(collected);
    setProgress(null);
  }

  if (results) {
    const ok = results.filter((r) => r.password).length;
    const sent = results.filter((r) => r.sms === "sent").length;
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="발급" value={ok} />
          <Stat label="실패" value={results.length - ok} />
          <Stat label="문자 발송" value={sent} />
        </div>
        <Alert>
          <AlertDescription>
            임시 비밀번호는 지금만 볼 수 있어요. CSV로 내려받아 학생들에게 나눠 준 뒤, 파일은 꼭 지워 주세요.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button onClick={() => downloadCsv(results)}>결과 CSV 내려받기</Button>
          <Button
            variant="outline"
            onClick={() => {
              setResults(null);
              setText("");
            }}
          >
            새 명단 발급
          </Button>
        </div>
        <ResultTable results={results} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="year">발급 연도</Label>
          <Input
            id="year"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-28"
          />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          기본 아이디 예: {defaultStudentUsername(year, "20315")} (연도+학번)
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="list">명단 붙여넣기</Label>
        <Textarea
          id="list"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-xs"
        />
      </div>

      {rows.length > 0 && (
        <>
          <p className="text-sm">
            {rows.length}명 중 <b className="text-primary">{valid.length}명</b> 발급 가능
            {rows.length > valid.length && ` · ${rows.length - valid.length}명은 고쳐야 해요`}
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학번</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>아이디</TableHead>
                  <TableHead>전화번호</TableHead>
                  <TableHead>확인</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{r.studentNo}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="font-mono">{r.username}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{maskPhone(r.phone)}</TableCell>
                    <TableCell>
                      {r.problem ? <Badge variant="destructive">{r.problem}</Badge> : <Badge variant="outline">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendText}
              disabled={!smsReady}
              onChange={(e) => setSendText(e.target.checked)}
              className="size-4"
            />
            발급 후 학생 휴대폰으로 아이디·임시 비밀번호 문자 보내기
            {!smsReady && <span className="text-muted-foreground">(문자 설정이 없어요 — 시스템 메뉴 참고)</span>}
          </label>

          <Button onClick={handleIssue} disabled={valid.length === 0 || progress !== null} className="self-start">
            {progress ? `발급 중... ${progress.done}/${progress.total}` : `${valid.length}명 발급하기`}
          </Button>
        </>
      )}
    </div>
  );
}

function ResultTable({ results }: { results: BulkResult[] }) {
  return (
    <div className="max-h-[32rem] overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>학번</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>아이디</TableHead>
            <TableHead>임시 비밀번호</TableHead>
            <TableHead>문자</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-mono">{r.studentNo}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell className="font-mono">{r.username}</TableCell>
              <TableCell className="font-mono text-primary">
                {r.password ?? <span className="text-destructive">{r.error}</span>}
              </TableCell>
              <TableCell className="text-xs">
                {r.sms === "sent" ? (
                  <Badge variant="outline">발송</Badge>
                ) : (
                  <span className="text-muted-foreground">{r.smsReason ?? "-"}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}
