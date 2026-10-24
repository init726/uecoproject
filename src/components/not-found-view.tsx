import Link from "next/link";
import { Button } from "@/components/ui/button";

// 없는 주소나 볼 수 없는 글(notFound())을 만났을 때 보여 주는 화면. 사이트 색을 따른다.
export function NotFoundView({ homeHref = "/home" }: { homeHref?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="eyebrow">404</p>
      <h2 className="page-title">페이지를 찾을 수 없습니다</h2>
      <p className="text-sm text-muted-foreground">주소가 바뀌었거나, 삭제되었거나, 볼 수 없는 글일 수 있어요.</p>
      <Button asChild size="lg" className="mt-2">
        <Link href={homeHref}>홈으로 가기</Link>
      </Button>
    </div>
  );
}
