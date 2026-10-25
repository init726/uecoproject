import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatRemaining, isPast } from "@/lib/format";
import type { StudentAssignment } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { FileText, Paperclip } from "lucide-react";

// 학생 화면의 과제 한 줄 (홈, 할 일 목록에서 같이 쓴다)
export function AssignmentRow({ assignment: a, compact = false }: { assignment: StudentAssignment; compact?: boolean }) {
  const overdue = isPast(a.due_at);

  return (
    <Link
      href={`/assignments/${a.id}`}
      className={cn("group flex min-w-0 items-start gap-3 p-4 transition-colors hover:bg-accent/40", !compact && "surface")}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary" aria-hidden="true">{a.type === "file" ? <Paperclip className="size-4" /> : <FileText className="size-4" />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {a.class?.name} · {a.type === "file" ? "파일" : "글"}
        </p>
        <p className="mt-0.5 text-sm font-semibold wrap-break-word group-hover:text-primary">{a.title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(a.due_at)}</p>
      </div>
      {a.submitted ? (
        <Badge variant={a.is_late ? "destructive" : "default"}>
          {a.is_late ? "마감 후 제출" : "제출 완료"}
        </Badge>
      ) : (
        <span
          className={cn(
            "mt-1 shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-medium",
            overdue ? "text-destructive" : "text-primary",
          )}
        >
          {overdue && !a.allow_late ? "제출 불가" : formatRemaining(a.due_at)}
        </span>
      )}
    </Link>
  );
}
