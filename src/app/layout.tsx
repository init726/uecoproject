import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import "./globals.css";

// 제목에 쓰는 굵은 글자(800~900)까지 고르게 나오도록 가변 글꼴을 쓴다. (globals.css 의 --font-sans 가 가장 먼저 참조한다)
const notoKr = Noto_Sans_KR({
  weight: ["400", "500", "700", "800", "900"],
  display: "swap",
  variable: "--font-noto-kr",
  preload: false,
});

export const metadata: Metadata = {
  title: "Cue",
  description: "고교학점제 시간표, 과제 제출, 공지를 한곳에서",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 화면 모드는 쿠키(theme)에 저장된다. 기본은 라이트이고, 다크로 바꾸면 처음부터 다크로 그려서 깜빡이지 않는다.
  const theme = (await cookies()).get("theme")?.value;

  return (
    // suppressHydrationWarning: 브라우저 확장 프로그램이 <html>·<body>에 속성을 붙여도 경고하지 않는다.
    // (이 두 태그의 속성에만 적용되고, 안쪽 화면의 오류는 그대로 잡힌다)
    <html lang="ko" className={cn("h-full antialiased", notoKr.variable, theme === "dark" && "dark")} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">본문으로 바로가기</a>
        {children}
      </body>
    </html>
  );
}
