import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { writableKinds } from "@/lib/community";
import { createPost } from "../actions";
import { PostForm } from "../post-form";
import { CommunityHeader } from "../ui";

export default async function NewPostPage() {
  const profile = await getProfile();
  const kinds = writableKinds(profile);
  if (kinds.length === 0) redirect("/community");
  const isAdmin = profile.role === "admin";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <CommunityHeader
        title={isAdmin ? "공지 쓰기" : "글쓰기"}
        description={isAdmin ? "학교 전체에 보이는 공지를 올립니다." : "질문이나 이야기를 남겨 보세요."}
      />
      <section className="school-panel">
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <PostForm action={createPost} kinds={kinds} submitLabel="올리기" />
        </div>
      </section>
    </div>
  );
}
