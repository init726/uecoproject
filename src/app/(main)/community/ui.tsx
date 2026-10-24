import { CircleCheck, MessageSquare, Pin } from "lucide-react";
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

// 말머리별 색: 학교 공지=빨강, 질문=파랑, 자유=노랑. (색 이름은 globals.css 의 kind-* 에 있다)
// Tailwind 가 클래스를 찾을 수 있게 이름을 통째로 적어 둔다.
const KIND_STYLE = {
  notice: {
    soft: "border-kind-notice-bar/30 bg-kind-notice-soft text-kind-notice",
    dot: "before:bg-kind-notice-bar",
    activeBorder: "border-kind-notice-bar",
    bar: "border-l-kind-notice-bar",
  },
  question: {
    soft: "border-kind-question-bar/30 bg-kind-question-soft text-kind-question",
    dot: "before:bg-kind-question-bar",
    activeBorder: "border-kind-question-bar",
    bar: "border-l-kind-question-bar",
  },
  free: {
    soft: "border-kind-free-bar/30 bg-kind-free-soft text-kind-free",
    dot: "before:bg-kind-free-bar",
    activeBorder: "border-kind-free-bar",
    bar: "border-l-kind-free-bar",
  },
} as const;

// 말머리 필터·탭에 쓰는 알약 모양 링크의 클래스. 선택된 것은 연한 강조 바탕.
export function chipClass(active: boolean) {
  return cn(
    "flex min-h-9 items-center rounded-full px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    active && "bg-accent font-semibold text-primary hover:bg-accent hover:text-primary",
  );
}

// 말머리 필터 알약. 평소에는 흰 바탕에 말머리 색 점만 두고, 지금 고른 것은 그 말머리 색으로 가득 채운다.
// (검정·연두처럼 채워진 색이 늘 보이면 어느 것이 선택됐는지 헷갈리기 때문이다)
// kind 가 빈 문자열이면 "전체" 알약: 평소 점 없음, 선택되면 주색(라이트=검정, 다크=연두)으로 채운다.
export function kindChipClass(kind: Post["kind"] | "", active: boolean) {
  const base =
    "flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors";
  if (!kind) {
    return cn(
      base,
      active
        ? "border-primary bg-primary font-bold text-primary-foreground"
        : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
    );
  }
  return cn(
    base,
    active
      ? cn("font-bold", KIND_STYLE[kind].soft, KIND_STYLE[kind].activeBorder)
      : cn(
          "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          "before:size-2 before:rounded-full before:content-['']",
          KIND_STYLE[kind].dot,
        ),
  );
}

export function KindBadge({ kind }: { kind: Post["kind"] }) {
  return (
    <Badge variant="outline" className={KIND_STYLE[kind].soft}>
      {POST_KIND_LABEL[kind]}
    </Badge>
  );
}

// 채택된 답변이 있는 질문에 붙는 배지
export function SolvedBadge() {
  return (
    <Badge variant="secondary">
      <CircleCheck aria-hidden="true" />
      해결됨
    </Badge>
  );
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
  accepted_comment_id?: string | null;
  author_name?: string;
  author_role?: Role;
  comment_count: number;
};

// 24시간 안에 올라온 글인지 (NEW 배지). 현재 시각을 읽는 부분을 함수로 떼어 두었다.
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
function isRecent(iso: string) {
  return Date.now() - new Date(iso).getTime() < NEW_WINDOW_MS;
}

// 목록의 글 한 줄. 작성자 정보가 있으면 보여준다. (내 글 목록에는 필요 없다)
export function PostRow({ post }: { post: RowPost }) {
  return (
    <Link
      href={`/community/${post.id}`}
      className={cn(
        "group flex min-w-0 items-start gap-3 border-l-4 p-4 transition-colors hover:bg-accent/40 sm:px-5",
        KIND_STYLE[post.kind].bar,
        post.pinned && "bg-accent/40",
      )}
    >
      <span
        className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border", KIND_STYLE[post.kind].soft)}
        aria-hidden="true"
      >
        {post.pinned ? <Pin className="size-4" /> : <MessageSquare className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={post.kind} />
          {post.kind === "question" && post.accepted_comment_id && <SolvedBadge />}
          <StatusBadge status={post.status} />
          {isRecent(post.created_at) && (
            <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] leading-none font-bold text-primary-foreground">
              NEW
            </span>
          )}
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
        {post.comment_count}
      </span>
    </Link>
  );
}
