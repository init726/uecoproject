"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

// 라이트 ↔ 다크 전환 버튼. 현재 모드는 <html class="dark"> 로 정해지고, 고른 모드는 쿠키(theme)에 1년 저장된다.
// 아이콘은 CSS(dark:)로 번갈아 보여 주므로 서버가 그린 화면과 어긋나지 않는다.
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    document.cookie = `theme=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="라이트·다크 모드 전환"
      title="라이트·다크 모드 전환"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      <Moon className="size-[18px] dark:hidden" aria-hidden="true" />
      <Sun className="hidden size-[18px] dark:block" aria-hidden="true" />
    </button>
  );
}
