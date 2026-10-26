import Link from "next/link";
import { SERVICE_NAME } from "@/lib/constants";

// 로고: 분필 글씨체 "Chalk" + 분필로 쓱 그은 하늘색 밑줄. 글자색은 라이트=검정, 다크=밝은 회백색을 따라간다.
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
      <span className="relative inline-block font-logo text-[1.9rem] leading-none font-bold text-school-navy">
        {name}
        <svg
          aria-hidden="true"
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          className="absolute -bottom-2 left-0 h-2 w-full text-school-gold"
        >
          <path d="M3 6 C 22 3, 41 8, 60 5 S 88 3, 97 6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      </span>
      {subtitle && <span className="truncate text-xs font-medium text-muted-foreground">{subtitle}</span>}
    </Link>
  );
}
