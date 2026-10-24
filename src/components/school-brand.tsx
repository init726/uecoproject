import Link from "next/link";

// 글자만으로 된 로고. 앞에 형광 연두 점을 붙여 사이트 강조색과 이어지게 했다.
// tone 은 예전(파란 위쪽 바 위에서 쓰던) 호출과 맞추려고 남겨 둔 값이고, 지금은 라이트·다크 모두 같은 모양이다.
export function SchoolBrand({
  href = "/home",
  subtitle = "학교생활 통합 포털",
}: {
  href?: string;
  subtitle?: string;
  tone?: "dark" | "light";
}) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5 rounded-sm" aria-label="우리학교 홈">
      <span className="size-3 shrink-0 rounded-[4px] bg-school-gold" aria-hidden="true" />
      <span className="text-xl leading-none font-black tracking-tight text-school-navy">우리학교</span>
      {subtitle && <span className="truncate text-xs font-medium text-muted-foreground">{subtitle}</span>}
    </Link>
  );
}
