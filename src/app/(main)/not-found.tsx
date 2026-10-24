import { NotFoundView } from "@/components/not-found-view";

// 로그인한 뒤 화면 안에서 notFound() 가 불렸을 때: 위쪽 메뉴는 그대로 두고 본문만 안내한다.
export default function MainNotFound() {
  return <NotFoundView />;
}
