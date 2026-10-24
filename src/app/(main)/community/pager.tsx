import Link from "next/link";

// 이전/다음 페이지 이동. href(page)가 해당 페이지 주소를 돌려준다.
export function Pager({
  page,
  totalPages,
  href,
}: {
  page: number;
  totalPages: number;
  href: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-3 text-sm" aria-label="페이지">
      {page > 1 ? (
        <Link href={href(page - 1)} className="text-primary hover:underline">
          ← 이전
        </Link>
      ) : (
        <span className="text-muted-foreground/50">← 이전</span>
      )}
      <span className="text-muted-foreground">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className="text-primary hover:underline">
          다음 →
        </Link>
      ) : (
        <span className="text-muted-foreground/50">다음 →</span>
      )}
    </nav>
  );
}
