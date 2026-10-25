import Link from "next/link";
import { SERVICE_NAME } from "@/lib/constants";

// 로고: 굵고 둥근 필기체 "Cue". 글자색은 라이트=검정, 다크=밝은 회백색을 따라간다.
// (tone 은 예전 호출과 맞추려고 남겨 둔 값이고 지금은 쓰지 않는다)
export function SchoolBrand({
  name = SERVICE_NAME,
  href = "/home",
  subtitle = "학교생활 통합 포털",
}: {
  name?: string;
  href?: string;
  subtitle?: string;
  tone?: "dark" | "light";
}) {
  return (
    <Link href={href} className="flex min-w-0 items-baseline gap-2.5 rounded-sm" aria-label={`${name} 홈`}>
      <span className="font-logo text-[1.75rem] leading-none font-bold tracking-tight text-school-navy">{name}</span>
      {subtitle && <span className="truncate text-xs font-medium text-muted-foreground">{subtitle}</span>}
    </Link>
  );
}
