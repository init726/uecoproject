import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>
            <ChevronLeft aria-hidden="true" />
            이전
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <ChevronLeft aria-hidden="true" />
          이전
        </Button>
      )}
      <span className="tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>
            다음
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          다음
          <ChevronRight aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}
