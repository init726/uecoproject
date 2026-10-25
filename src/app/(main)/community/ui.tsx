import { CircleCheck, MessageSquare, Pin } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { CONTENT_STATUS_LABEL, POST_KIND_LABEL, ROLE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { ContentStatus, Post, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

// 커뮤니티 화면이 같이 쓰는 작은 부품. 모양은 docs/design-guide.md 를 따른다.

// 페이지 맨 위: 공용 PageHeader 에 커뮤니티 기본 안내 글만 붙인다
export function CommunityHeader({ eyebrow = "학교 커뮤니티", ...props }: React.ComponentProps<typeof PageHeader>) {
  return <PageHeader eyebrow={eyebrow} {...props} />;
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

// 말머리별 색: 학교 공지=하늘색, 질문=검정, 자유게시판=회색. (색 이름은 globals.css 의 kind-* 에 있다)
// Tailwind 가 클래스를 찾을 수 있게 이름을 통째로 적어 둔다.
const KIND_STYLE = {
  notice: {
    soft: "border-kind-notice-bar/30 bg-kind-notice-soft text-kind-notice",
    dot: "before:bg-kind-notice-bar",
    bar: "border-l-kind-notice-bar",
  },
  question: {
    soft: "border-kind-question-bar/30 bg-kind-question-soft text-kind-question",
    dot: "before:bg-kind-question-bar",
    bar: "border-l-kind-question-bar",
  },
  free: {
    soft: "border-kind-free-bar/30 bg-kind-free-soft text-kind-free",
    dot: "before:bg-kind-free-bar",
    bar: "border-l-kind-free-bar",
  },
} as const;

// 말머리 필터·탭에 쓰는 알약 모양 링크의 클래스. 선택된 것은 연한 강조 바탕.
export function chipClass(active: boolean) {
  return cn(
    "flex min-h-9 items-center rounded-full px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    active && "font-bold text-foreground ring-1 ring-foreground",
  );
}

// 말머리 필터 알약. 늘 흰 바탕에 말머리 색 점만 둔다. 선택해도 칸을 색으로 채우지 않고,
// 글씨를 굵게 하고 테두리를 짙게(글자색과 같게) 해서 표시한다.
// kind 가 빈 문자열이면 "전체" 알약: 점이 없다.
export function kindChipClass(kind: Post["kind"] | "", active: boolean) {
  return cn(
    "flex min-h-9 items-center gap-2 rounded-full border bg-card px-3.5 text-sm font-medium transition-colors",
    active
      ? "border-foreground font-bold text-foreground ring-1 ring-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    // 색 점: 흐린 바탕에서도 보이도록 얇은 테두리를 두른다.
    kind && ["before:size-2 before:rounded-full before:ring-1 before:ring-foreground/15 before:content-['']", KIND_STYLE[kind].dot],
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

// 작성자. 학생은 "학번 이름"(서버가 붙인다), 선생님은 따뜻한 색 알약으로 바로 구분되게 한다.
export function AuthorLine({ name, role, createdAt }: { name: string; role: Role; createdAt: string }) {
  return (
    <>
      {role === "teacher" ? (
        <span className="rounded-full bg-teacher-soft px-2 py-0.5 font-semibold text-teacher">{name} 선생님</span>
      ) : (
        <>
          <span className="font-medium text-foreground">{name}</span>
          <span>{ROLE_LABEL[role]}</span>
        </>
      )}
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

// 1시간 안에 올라온 글인지 (NEW 배지). 현재 시각을 읽는 부분을 함수로 떼어 두었다.
const NEW_WINDOW_MS = 60 * 60 * 1000;
function isRecent(iso: string) {
  return Date.now() - new Date(iso).getTime() < NEW_WINDOW_MS;
}

// 목록의 글 한 줄. 작성자 정보가 있으면 보여준다. (내 글 목록에는 필요 없다)
// read: 내가 이미 연 글이면 NEW 대신 "읽음"을 보여 준다.
export function PostRow({ post, read = false }: { post: RowPost; read?: boolean }) {
  return (
    <Link
      href={`/community/${post.id}`}
      className={cn(
        "group flex min-w-0 items-start gap-3 border-l-4 p-4 transition-colors hover:bg-accent/40 sm:px-5",
        KIND_STYLE[post.kind].bar,
        post.author_role === "teacher" && "bg-teacher-soft/70",
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
          {read ? (
            <span className="text-[11px] font-medium text-muted-foreground">읽음</span>
          ) : isRecent(post.created_at) && (
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
