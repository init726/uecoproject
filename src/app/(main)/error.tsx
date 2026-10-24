"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MainError({ retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="surface mx-auto flex max-w-lg flex-col gap-4 p-6">
    <h2 className="text-xl font-semibold">화면을 불러오지 못했어요</h2>
    <p className="text-sm text-muted-foreground">연결 상태를 확인하고 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.</p>
    <div className="flex gap-2">
      <Button onClick={retry}>다시 시도</Button>
      <Button asChild variant="outline"><Link href="/me">내 정보</Link></Button>
    </div>
  </div>;
}
