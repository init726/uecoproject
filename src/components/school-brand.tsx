import Link from "next/link";
import { SERVICE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

// 글자만으로 된 로고. tone="light"는 남색 바탕(위쪽 바) 위에서 쓴다.
export function SchoolBrand({
  name = SERVICE_NAME,
  href = "/home",
  subtitle = "학교생활 통합 포털",
  tone = "dark",
}: {
  name?: string;
  href?: string;
  subtitle?: string;
  tone?: "dark" | "light";
}) {
  const light = tone === "light";
  return (
    <Link
      href={href}
      className={cn("flex min-w-0 items-baseline gap-2.5 rounded-sm", light && "focus-visible:outline-white")}
      aria-label={`${name} 홈`}
    >
      <span className={cn("max-w-[min(45vw,18rem)] truncate text-xl leading-none font-extrabold tracking-tight", light ? "text-white" : "text-school-navy")}>
        {name}
      </span>
      {subtitle && (
        <span className={cn("truncate text-xs font-medium", light ? "text-white/80" : "text-muted-foreground")}>
          {subtitle}
        </span>
      )}
    </Link>
  );
}
