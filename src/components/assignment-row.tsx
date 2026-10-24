import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatRemaining, isPast } from "@/lib/format";
import type { StudentAssignment } from "@/lib/queries";
import { cn } from "@/lib/utils";

// 학생 화면의 과제 한 줄 (홈, 할 일 목록에서 같이 쓴다)
export function AssignmentRow({ assignment: a }: { assignment: StudentAssignment }) {
  const overdue = isPast(a.due_at);

  return (
    <Link
      href={`/assignments/${a.id}`}
      className="flex items-center gap-3 rounded-xl border bg-background p-3 hover:border-primary"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {a.class?.name} · {a.type === "file" ? "파일" : "글"}
        </p>
        <p className="truncate font-medium">{a.title}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(a.due_at)}</p>
      </div>
      {a.submitted ? (
        <Badge variant={a.is_late ? "destructive" : "default"}>
          {a.is_late ? "지각 제출" : "제출 완료"}
        </Badge>
      ) : (
        <span
          className={cn(
            "shrink-0 text-sm font-medium",
            overdue ? "text-destructive" : "text-primary",
          )}
        >
          {overdue && !a.allow_late ? "제출 불가" : formatRemaining(a.due_at)}
        </span>
      )}
    </Link>
  );
}
