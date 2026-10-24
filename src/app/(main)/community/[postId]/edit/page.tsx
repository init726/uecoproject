import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updatePost } from "../../actions";
import { PostForm } from "../../post-form";
import { CommunityHeader } from "../../ui";

export default async function EditPostPage(props: PageProps<"/community/[postId]/edit">) {
  const { postId } = await props.params;
  const profile = await getProfile();

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select("title, body, author_id, status")
    .eq("id", postId)
    .maybeSingle();
  // 내 글이고 게시 중일 때만 고칠 수 있다. (관리자도 남의 글은 고치지 않는다)
  if (!post || post.author_id !== profile.id || post.status !== "published") notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <CommunityHeader title="글 수정" description="제목과 내용을 고칠 수 있습니다." />
      <section className="school-panel">
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <PostForm
            action={updatePost.bind(null, postId)}
            initial={{ title: post.title, body: post.body }}
            submitLabel="수정하기"
          />
        </div>
      </section>
    </div>
  );
}
