import type { Metadata } from "next";
import { Cabin_Sketch, Noto_Sans_KR } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import { SCHOOL_NAME, SERVICE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import "./globals.css";

// 제목에 쓰는 굵은 글자(800~900)까지 고르게 나오도록 가변 글꼴을 쓴다. (globals.css 의 --font-sans 가 가장 먼저 참조한다)
const notoKr = Noto_Sans_KR({
  weight: ["400", "500", "700", "800", "900"],
  display: "swap",
  variable: "--font-noto-kr",
  preload: false,
});

// 로고(Chalk) 전용: 분필로 쓴 듯한 거친 글꼴. 로고 한 단어에만 쓰므로 굵은 700 하나만 받는다.
const chalkFont = Cabin_Sketch({
  weight: "700",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-chalk",
});

export const metadata: Metadata = {
  title: SERVICE_NAME,
  description: `${SCHOOL_NAME} 고교학점제 시간표, 과제 제출, 공지를 한곳에서`,
};

// 일부 브라우저 확장 프로그램이 페이지의 모든 <div>에 bis_skin_checked 속성을 몰래 붙여서
// 개발 서버에 hydration 경고가 뜬다. React가 화면을 연결하기 전에 그 속성만 걷어낸다.
// 개발 서버에서만 실행한다. 초기 DOM과 이후 페이지 이동에서 추가되는 DOM을 모두 처리한다.
// 특정 속성만 제거하며, 앱 자체의 hydration 오류는 숨기지 않는다.
const STRIP_EXTENSION_ATTRIBUTES = `(() => {
  const KEY = Symbol.for("school.dev.extensionAttributeGuard");
  if (window[KEY]) return;
  const NAME = "bis_skin_checked";
  const clean = (root) => {
    if (root.nodeType !== 1) return;
    if (root.hasAttribute(NAME)) root.removeAttribute(NAME);
    root.querySelectorAll("[" + NAME + "]").forEach((el) => el.removeAttribute(NAME));
  };
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") {
        if (r.target.hasAttribute(NAME)) r.target.removeAttribute(NAME);
      }
      else r.addedNodes.forEach(clean);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: [NAME] });
  clean(document.documentElement);
  window[KEY] = observer;
})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 화면 모드는 쿠키(theme)에 저장된다. 기본은 라이트이고, 다크로 바꾸면 처음부터 다크로 그려서 깜빡이지 않는다.
  const theme = (await cookies()).get("theme")?.value;

  return (
    // suppressHydrationWarning: 브라우저 확장 프로그램이 <html>·<body>에 속성을 붙여도 경고하지 않는다.
    // (이 두 태그의 속성에만 적용되고, 안쪽 화면의 오류는 그대로 잡힌다)
    <html lang="ko" className={cn("h-full antialiased", notoKr.variable, chalkFont.variable, theme === "dark" && "dark")} suppressHydrationWarning>
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
