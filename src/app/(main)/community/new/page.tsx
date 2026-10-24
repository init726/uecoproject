import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { writableKinds } from "@/lib/community";
import { createPost } from "../actions";
import { PostForm } from "../post-form";

export default async function NewPostPage() {
  const profile = await getProfile();
  const kinds = writableKinds(profile);
  if (kinds.length === 0) redirect("/community");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h2 className="text-xl font-bold">{profile.role === "admin" ? "공지 쓰기" : "글쓰기"}</h2>
      <PostForm action={createPost} kinds={kinds} submitLabel="올리기" />
    </div>
  );
}
