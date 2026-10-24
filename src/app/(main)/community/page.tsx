import { MessagesSquare, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getProfile } from "@/lib/auth";
import { sanitizeSearch, writableKinds } from "@/lib/community";
import { COMMUNITY_PAGE_SIZE, POST_KIND_LABEL } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { Post } from "@/lib/types";
import { Pager } from "./pager";
import { chipClass, CommunityHeader, EmptyState, PostRow } from "./ui";

type Row = Pick<Post, "id" | "kind" | "title" | "author_name" | "author_role" | "pinned" | "status" | "created_at"> & {
  comments: { count: number }[];
};

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
  const page = Math.max(1, Number.parseInt(String(searchParams.page ?? "1"), 10) || 1);

  const profile = await getProfile();
  const supabase = await createClient();

  // 게시 중인 글만 최신순으로. 고정된 공지는 맨 위. (RLS도 숨겨진 글은 내주지 않는다)
  let query = supabase
    .from("posts")
    .select("id, kind, title, author_name, author_role, pinned, status, created_at, comments(count)", { count: "exact" })
    .eq("status", "published");
  if (kind) query = query.eq("kind", kind);
  // 제목이나 본문에 검색어가 들어 있는 글 (대소문자 구분 없음)
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
  const from = (page - 1) * COMMUNITY_PAGE_SIZE;
  const { data, count } = await query
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + COMMUNITY_PAGE_SIZE - 1)
    .overrideTypes<Row[], { merge: false }>();

  const posts = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / COMMUNITY_PAGE_SIZE));
  const href = (next: { kind?: string; q?: string; page?: number }) => {
    const search = new URLSearchParams();
    const k = next.kind ?? kind;
    const keyword = next.q ?? q;
    if (k) search.set("kind", k);
    if (keyword) search.set("q", keyword);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const text = search.toString();
    return text ? `/community?${text}` : "/community";
  };
  const canWrite = writableKinds(profile).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <CommunityHeader
        title="커뮤니티"
        description="학교 공지를 확인하고, 학생과 선생님이 함께 질문하고 이야기하는 공간입니다."
        actions={
          <>
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
            <Input
              name="q"
              defaultValue={q}
              placeholder="제목이나 내용으로 검색"
              maxLength={50}
              aria-label="글 검색"
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
            <Link key={f.value} href={href({ kind: f.value })} className={chipClass(kind === f.value)}>
              {f.label}
            </Link>
          ))}
          {q && (
            <Link href={href({ q: "" })} className="ml-auto text-xs text-muted-foreground hover:text-primary">
              검색 초기화
            </Link>
          )}
        </div>

        {posts.length === 0 ? (
          <EmptyState
            title={q ? `'${q}' 검색 결과가 없습니다.` : kind ? "이 말머리에는 아직 글이 없습니다." : "아직 글이 없습니다."}
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
