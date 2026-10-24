import { MessageSquare, Pin } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { writableKinds } from "@/lib/community";
import { COMMUNITY_PAGE_SIZE, POST_KIND_LABEL, ROLE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Post } from "@/lib/types";
import { cn } from "@/lib/utils";

type Row = Pick<Post, "id" | "kind" | "title" | "author_name" | "author_role" | "pinned" | "created_at"> & {
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
  const page = Math.max(1, Number.parseInt(String(searchParams.page ?? "1"), 10) || 1);

  const profile = await getProfile();
  const supabase = await createClient();

  // 게시 중인 글만 최신순으로. 고정된 공지는 맨 위. (RLS도 숨겨진 글은 내주지 않는다)
  let query = supabase
    .from("posts")
    .select("id, kind, title, author_name, author_role, pinned, created_at, comments(count)", { count: "exact" })
    .eq("status", "published");
  if (kind) query = query.eq("kind", kind);
  const from = (page - 1) * COMMUNITY_PAGE_SIZE;
  const { data, count } = await query
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + COMMUNITY_PAGE_SIZE - 1)
    .overrideTypes<Row[], { merge: false }>();

  const posts = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / COMMUNITY_PAGE_SIZE));
  const href = (next: { kind?: string; page?: number }) => {
    const search = new URLSearchParams();
    const k = next.kind ?? kind;
    if (k) search.set("kind", k);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const text = search.toString();
    return text ? `/community?${text}` : "/community";
  };
  const canWrite = writableKinds(profile).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">커뮤니티</h2>
        {canWrite && (
          <Button asChild>
            <Link href="/community/new">{profile.role === "admin" ? "공지 쓰기" : "글쓰기"}</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ kind: f.value })}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent",
              kind === f.value && "bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <Card>
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {kind ? "이 말머리에는 아직 글이 없어요." : "아직 글이 없어요. 첫 글을 남겨 보세요!"}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/community/${post.id}`}>
                <Card size="sm" className={cn("hover:bg-accent/50", post.pinned && "bg-accent/40")}>
                  <div className="flex flex-col gap-1.5 px-3">
                    <div className="flex items-center gap-2">
                      {post.pinned && <Pin className="size-3.5 shrink-0 text-primary" />}
                      <Badge variant={post.kind === "notice" ? "default" : "secondary"}>
                        {POST_KIND_LABEL[post.kind]}
                      </Badge>
                      <span className="truncate font-medium">{post.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>
                        {post.author_name} · {ROLE_LABEL[post.author_role]}
                      </span>
                      <span>{formatDateTime(post.created_at)}</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-3" />
                        {post.comments[0]?.count ?? 0}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="페이지">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="text-primary hover:underline">
              ← 이전
            </Link>
          ) : (
            <span className="text-muted-foreground/50">← 이전</span>
          )}
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={href({ page: page + 1 })} className="text-primary hover:underline">
              다음 →
            </Link>
          ) : (
            <span className="text-muted-foreground/50">다음 →</span>
          )}
        </nav>
      )}
    </div>
  );
}
