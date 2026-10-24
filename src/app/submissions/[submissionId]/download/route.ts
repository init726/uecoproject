import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 제출 파일 내려받기. RLS가 본인과 담당 교사에게만 기록을 돌려주고,
// 5분 뒤 만료되는 임시 링크로 보낸다. (링크가 퍼져도 곧 쓸 수 없게 된다)
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/submissions/[submissionId]/download">,
) {
  const { submissionId } = await context.params;
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("submissions")
    .select("file_path, file_name")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission?.file_path) {
    return new NextResponse("파일을 찾을 수 없어요.", { status: 404 });
  }

  const { data } = await supabase.storage
    .from("submissions")
    .createSignedUrl(submission.file_path, 300, { download: submission.file_name ?? true });
  if (!data) {
    return new NextResponse("파일을 찾을 수 없어요.", { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
