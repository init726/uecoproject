import { NotFoundView } from "@/components/not-found-view";

// 주소 자체가 없을 때(메뉴 화면 밖). 로그인 전에도 보일 수 있어서 홈 대신 로그인으로 보낸다.
export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-dvh flex-1 flex-col bg-background">
      <NotFoundView homeHref="/login" />
    </main>
  );
}
