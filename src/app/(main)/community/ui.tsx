import { MessageSquare, Pin } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CONTENT_STATUS_LABEL, POST_KIND_LABEL, ROLE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { ContentStatus, Post, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

// 커뮤니티 화면이 같이 쓰는 작은 부품. 모양은 docs/design-guide.md 를 따른다.

// 페이지 맨 위: 작은 안내 글 + 큰 제목 + 설명, 오른쪽에 버튼
export function CommunityHeader({
  eyebrow = "학교 커뮤니티",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="page-title">{title}</h2>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// 내용이 없을 때: 굵은 한 줄 + 설명
export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-7">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

// 말머리 필터·탭에 쓰는 알약 모양 링크의 클래스. 선택된 것은 연한 강조 바탕.
export function chipClass(active: boolean) {
  return cn(
    "flex min-h-9 items-center rounded-full px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    active && "bg-accent font-semibold text-primary hover:bg-accent hover:text-primary",
  );
}

export function KindBadge({ kind }: { kind: Post["kind"] }) {
  return <Badge variant={kind === "notice" ? "default" : "secondary"}>{POST_KIND_LABEL[kind]}</Badge>;
}

export function StatusBadge({ status }: { status: ContentStatus }) {
  if (status === "published") return null;
  return <Badge variant="destructive">{CONTENT_STATUS_LABEL[status]}</Badge>;
}

export function AuthorLine({ name, role, createdAt }: { name: string; role: Role; createdAt: string }) {
  return (
    <>
      <span className="font-medium text-foreground">{name}</span>
      <span>{ROLE_LABEL[role]}</span>
      <span>{formatDateTime(createdAt)}</span>
    </>
  );
}

type RowPost = Pick<Post, "id" | "kind" | "title" | "pinned" | "created_at" | "status"> & {
  author_name?: string;
  author_role?: Role;
  comments: { count: number }[];
};

// 목록의 글 한 줄. 작성자 정보가 있으면 보여준다. (내 글 목록에는 필요 없다)
export function PostRow({ post }: { post: RowPost }) {
  return (
    <Link
      href={`/community/${post.id}`}
      className={cn("group flex min-w-0 items-start gap-3 p-4 transition-colors hover:bg-accent/40 sm:px-5", post.pinned && "bg-accent/40")}
    >
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"
        aria-hidden="true"
      >
        {post.pinned ? <Pin className="size-4" /> : <MessageSquare className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={post.kind} />
          <StatusBadge status={post.status} />
        </div>
        <p className="mt-1 text-sm font-semibold wrap-break-word group-hover:text-primary">{post.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          {post.author_name && post.author_role ? (
            <AuthorLine name={post.author_name} role={post.author_role} createdAt={post.created_at} />
          ) : (
            <span>{formatDateTime(post.created_at)}</span>
          )}
        </p>
      </div>
      <span className="mt-1 flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-primary">
        <MessageSquare className="size-3" aria-hidden="true" />
        <span className="sr-only">댓글</span>
        {post.comments[0]?.count ?? 0}
      </span>
    </Link>
  );
}
