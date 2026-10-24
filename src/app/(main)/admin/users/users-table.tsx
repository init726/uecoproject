"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABEL } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { type BulkDeleteResult, deleteAccountsAction } from "../actions";
import { UserActions } from "./user-actions";

export type UserRow = {
  id: string;
  role: Role;
  name: string;
  loginId: string;
  detail: string | null; // 학번 또는 담당 교과
  pending: boolean;
  lastSignIn: string | null;
  isMe: boolean;
};

const CONFIRM_WORD = "삭제";

// 사용자 목록 + 여러 명 골라서 한 번에 삭제
export function UsersTable({ users }: { users: UserRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeRecords, setIncludeRecords] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<BulkDeleteResult | null>(null);

  const selectable = users.filter((u) => !u.isMe);
  const allSelected = selectable.length > 0 && selectable.every((u) => selected.has(u.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    setDeleting(true);
    setResult(await deleteAccountsAction([...selected], includeRecords));
    setSelected(new Set());
    setConfirmText("");
    setDeleting(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <span className="font-medium">{selected.size}명 선택</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeRecords}
              onChange={(e) => setIncludeRecords(e.target.checked)}
              className="size-4"
            />
            제출 기록·파일까지 함께 삭제 (졸업생 정리용)
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={`"${CONFIRM_WORD}" 입력`}
            className="h-8 w-28"
          />
          <Button
            variant="destructive"
            size="sm"
            disabled={confirmText !== CONFIRM_WORD || deleting}
            onClick={handleDelete}
          >
            <Trash2 />
            {deleting ? "삭제 중..." : `${selected.size}명 삭제`}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      {result && (
        <Alert>
          <AlertDescription>
            <p>
              {result.deleted}명 삭제했어요.
              {result.failed.length > 0 && ` ${result.failed.length}명은 삭제하지 않았어요:`}
            </p>
            {result.failed.length > 0 && (
              <ul className="list-disc pl-4">
                {result.failed.slice(0, 20).map((f, i) => (
                  <li key={i}>
                    {f.name} — {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="모두 선택"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((u) => u.id)))}
                  className="size-4"
                />
              </TableHead>
              <TableHead>종류</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>아이디</TableHead>
              <TableHead className="hidden lg:table-cell">학번/교과</TableHead>
              <TableHead className="hidden lg:table-cell">마지막 로그인</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} data-state={selected.has(u.id) ? "selected" : undefined}>
                <TableCell>
                  {!u.isMe && (
                    <input
                      type="checkbox"
                      aria-label={`${u.name} 선택`}
                      checked={selected.has(u.id)}
                      onChange={() => toggle(u.id)}
                      className="size-4"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{ROLE_LABEL[u.role]}</Badge>
                  {u.pending && <Badge className="ml-1">대기</Badge>}
                </TableCell>
                <TableCell>
                  {u.name}
                  {u.isMe && <span className="ml-1 text-xs text-muted-foreground">(나)</span>}
                </TableCell>
                <TableCell className="font-mono text-xs">{u.loginId}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{u.detail}</TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                  {u.lastSignIn ?? "-"}
                </TableCell>
                <TableCell>
                  <UserActions userId={u.id} name={u.name} isMe={u.isMe} />
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  해당하는 사용자가 없어요.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
