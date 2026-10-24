import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "우리학교",
  description: "고교학점제 시간표, 과제 제출, 공지를 한곳에서",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: 브라우저 확장 프로그램이 <html>·<body>에 속성을 붙여도 경고하지 않는다.
    // (이 두 태그의 속성에만 적용되고, 안쪽 화면의 오류는 그대로 잡힌다)
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">본문으로 바로가기</a>
        {children}
      </body>
    </html>
  );
}
