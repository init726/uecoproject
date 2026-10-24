"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// 현재 주소와 같으면 data-active가 붙는 링크. 모양은 각 화면 틀이 정한다.
export function NavLink({
  href,
  exact = false,
  className,
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      className={cn(className)}
    >
      {children}
    </Link>
  );
}
