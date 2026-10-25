import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 과제 참고 자료 내려받기. RLS가 그 수업의 담당 교사와 학생에게만 기록을 돌려주고,
// 5분 뒤 만료되는 임시 링크로 보낸다. (제출 파일 내려받기와 같은 방식)
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/assignment-files/[fileId]/download">,
) {
  const { fileId } = await context.params;
  const supabase = await createClient();

  const { data: file } = await supabase
    .from("assignment_files")
    .select("file_path, file_name")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return new NextResponse("파일을 찾을 수 없어요.", { status: 404 });

  const { data } = await supabase.storage
    .from("assignment-files")
    .createSignedUrl(file.file_path, 300, { download: file.file_name });
  if (!data) return new NextResponse("파일을 찾을 수 없어요.", { status: 404 });

  return NextResponse.redirect(data.signedUrl);
}
