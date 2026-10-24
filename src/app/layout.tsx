import type { Metadata } from "next";
import Script from "next/script";
import { SCHOOL_NAME, SERVICE_NAME } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: SERVICE_NAME,
  description: `${SCHOOL_NAME} 고교학점제 시간표, 과제 제출, 공지를 한곳에서`,
};

// 일부 브라우저 확장 프로그램이 페이지의 모든 <div>에 bis_skin_checked 속성을 몰래 붙여서
// 개발 서버에 hydration 경고가 뜬다. React가 화면을 연결하기 전에 그 속성만 걷어낸다.
// 개발 서버에서만 실행하고, 10초 뒤에는 스스로 멈춘다. (배포된 사이트에는 들어가지 않는다)
const STRIP_EXTENSION_ATTRIBUTES = `(() => {
  const NAME = "bis_skin_checked";
  const clean = (root) => {
    if (root.nodeType !== 1) return;
    if (root.hasAttribute(NAME)) root.removeAttribute(NAME);
    root.querySelectorAll("[" + NAME + "]").forEach((el) => el.removeAttribute(NAME));
  };
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") r.target.removeAttribute(NAME);
      else r.addedNodes.forEach(clean);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: [NAME] });
  setTimeout(() => observer.disconnect(), 10000);
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: 브라우저 확장 프로그램이 <html>·<body>에 속성을 붙여도 경고하지 않는다.
    // (이 두 태그의 속성에만 적용되고, 안쪽 화면의 오류는 그대로 잡힌다)
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {process.env.NODE_ENV === "development" && (
          <Script id="strip-extension-attributes" strategy="beforeInteractive">
            {STRIP_EXTENSION_ATTRIBUTES}
          </Script>
        )}
        <a href="#main-content" className="skip-link">본문으로 바로가기</a>
        {children}
      </body>
    </html>
  );
}
