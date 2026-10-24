import { Bell, CircleHelp, MessagesSquare, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { getUnreadCount } from "@/components/community-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getProfile } from "@/lib/auth";
import { sanitizeSearch, writableKinds } from "@/lib/community";
import { COMMUNITY_PAGE_SIZE, POST_KIND_LABEL } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { Post } from "@/lib/types";
import { Pager } from "./pager";
import { cn } from "@/lib/utils";
import { CommunityHeader, EmptyState, kindChipClass, PostRow } from "./ui";

type Row = Pick<
  Post,
  | "id"
  | "kind"
  | "title"
  | "author_name"
  | "author_role"
  | "pinned"
  | "status"
  | "created_at"
  | "accepted_comment_id"
  | "comment_count"
>;

// 정렬. 고정된 공지는 어떤 정렬에서도 맨 위에 둔다.
const SORTS = [
  { value: "latest", label: "최신순" },
  { value: "comments", label: "댓글 많은 순" },
  { value: "active", label: "최근 댓글순" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

const FILTERS = [
  { value: "", label: "전체" },
  { value: "notice", label: POST_KIND_LABEL.notice },
  { value: "question", label: POST_KIND_LABEL.question },
  { value: "free", label: POST_KIND_LABEL.free },
] as const;

export default async function CommunityPage(props: PageProps<"/community">) {
  const searchParams = await props.searchParams;
  const kindParam = String(searchParams.kind ?? "");
  const kind = FILTERS.find((f) => f.value && f.value === kindParam)?.value ?? "";
  const q = sanitizeSearch(String(searchParams.q ?? ""));
  // 질문 말머리에서만: 아직 채택된 답변이 없는 질문만 보기
  const openOnly = kind === "question" && searchParams.open === "1";
  const sort: Sort = SORTS.find((s) => s.value === searchParams.sort)?.value ?? "latest";
  const page = Math.max(1, Number.parseInt(String(searchParams.page ?? "1"), 10) || 1);

  const profile = await getProfile();
  const supabase = await createClient();

  // 게시 중인 글만. 고정된 공지는 맨 위. (RLS도 숨겨진 글은 내주지 않는다)
  let query = supabase
    .from("posts")
    .select(
      "id, kind, title, author_name, author_role, pinned, status, created_at, accepted_comment_id, comment_count",
      { count: "exact" },
    )
    .eq("status", "published");
  if (kind) query = query.eq("kind", kind);
  if (openOnly) query = query.is("accepted_comment_id", null);
  // 제목이나 본문에 검색어가 들어 있는 글 (대소문자 구분 없음)
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
  const from = (page - 1) * COMMUNITY_PAGE_SIZE;
  query = query.order("pinned", { ascending: false });
  // 댓글 수·마지막 활동 시각은 DB 트리거가 글에 맞춰 둔 값이다. 같은 값이면 최신 글이 먼저.
  if (sort === "comments") query = query.order("comment_count", { ascending: false });
  if (sort === "active") query = query.order("last_activity_at", { ascending: false });
  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + COMMUNITY_PAGE_SIZE - 1)
    .overrideTypes<Row[], { merge: false }>();

  const posts = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / COMMUNITY_PAGE_SIZE));
  const href = (next: { kind?: string; q?: string; open?: boolean; sort?: Sort; page?: number }) => {
    const search = new URLSearchParams();
    const k = next.kind ?? kind;
    const keyword = next.q ?? q;
    const s = next.sort ?? sort;
    // 말머리를 바꾸면 미해결 필터는 풀린다. (질문에서만 의미가 있다)
    const open = next.open ?? (next.kind === undefined && openOnly);
    if (k) search.set("kind", k);
    if (open && k === "question") search.set("open", "1");
    if (keyword) search.set("q", keyword);
    if (s !== "latest") search.set("sort", s);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const text = search.toString();
    return text ? `/community?${text}` : "/community";
  };
  const canWrite = writableKinds(profile).length > 0;
  const unread = await getUnreadCount();

  return (
    <div className="flex flex-col gap-6">
      <CommunityHeader
        title="커뮤니티"
        description="학교 공지를 확인하고, 학생과 선생님이 함께 질문하고 이야기하는 공간입니다."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/community/notifications">
                <Bell aria-hidden="true" />
                알림
                {unread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/community/me">
                <UserRound aria-hidden="true" />내 활동
              </Link>
            </Button>
            {canWrite && (
              <Button asChild size="sm">
                <Link href="/community/new">{profile.role === "admin" ? "공지 쓰기" : "글쓰기"}</Link>
              </Button>
            )}
          </>
        }
      />

      <section className="school-panel">
        <div className="school-panel-heading">
          <h3 className="school-panel-title">
            <MessagesSquare className="size-[18px] text-primary" aria-hidden="true" />
            {q ? "검색 결과" : "최근 글"}
            <span className="text-sm font-normal text-muted-foreground">{count ?? 0}</span>
          </h3>
          <form action="/community" role="search" className="flex w-full gap-2 sm:w-auto">
            {kind && <input type="hidden" name="kind" value={kind} />}
            {openOnly && <input type="hidden" name="open" value="1" />}
            {sort !== "latest" && <input type="hidden" name="sort" value={sort} />}
            <Input
              name="q"
              defaultValue={q}
              placeholder="제목이나 내용으로 검색"
              maxLength={50}
              aria-label="글 검색"
              autoComplete="off"
              className="sm:w-64"
            />
            <Button type="submit" variant="outline" size="sm" className="h-10">
              <Search aria-hidden="true" />
              검색
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2 sm:px-4">
          {FILTERS.map((f) => (
            <Link key={f.value} href={href({ kind: f.value })} className={kindChipClass(f.value, kind === f.value)}>
              {f.label}
            </Link>
          ))}
          {kind === "question" && (
            <Link
              href={href({ open: !openOnly })}
              className={cn(
                "ml-2 flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground hover:bg-muted",
                openOnly && "border-primary bg-accent font-semibold text-primary hover:bg-accent",
              )}
              aria-pressed={openOnly}
            >
              <CircleHelp className="size-4" aria-hidden="true" />
              미해결만 보기
            </Link>
          )}
          <nav className="ml-auto flex items-center gap-1 text-xs" aria-label="정렬">
            {q && (
              <Link href={href({ q: "" })} className="mr-2 text-muted-foreground hover:text-primary">
                검색 초기화
              </Link>
            )}
            {SORTS.map((s) => (
              <Link
                key={s.value}
                href={href({ sort: s.value })}
                aria-current={sort === s.value ? "true" : undefined}
                className={cn(
                  "flex min-h-8 items-center rounded-md px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground",
                  sort === s.value && "bg-accent font-semibold text-primary hover:bg-accent hover:text-primary",
                )}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </div>

        {posts.length === 0 ? (
          <EmptyState
            title={
              q
                ? `'${q}' 검색 결과가 없습니다.`
                : openOnly
                  ? "미해결 질문이 없습니다."
                  : kind
                    ? "이 말머리에는 아직 글이 없습니다."
                    : "아직 글이 없습니다."
            }
            detail={q ? "다른 검색어로 다시 찾아보세요." : "첫 글을 남겨 보세요."}
          />
        ) : (
          <div className="divide-y">
            {posts.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>

      <Pager page={page} totalPages={totalPages} href={(p) => href({ page: p })} />
    </div>
  );
}
