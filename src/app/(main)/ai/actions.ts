"use server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateSchoolText, redactPersonalData, schoolAiReady } from "@/lib/school-ai";

export async function writingHelp(assignmentId:string, kind:"feedback"|"draft", content:string, consent:boolean):Promise<{text?:string;error?:string}> {
 const profile=await requireRole("student");
 if (!consent) return {error:"학교 AI 처리 안내를 확인해 주세요."};
 if (!schoolAiReady()) return {error:"학교에서 AI 연결을 준비하고 있습니다. 일반 작성·제출은 사용할 수 있습니다."};
 if ((kind!=="feedback"&&kind!=="draft") || typeof content!=="string" || content.length>10000) return {error:"잘못된 요청입니다."};
 const client=await createClient();
 const {data:a,error}=await client.from("assignments").select("id,class_id,type,purpose,max_chars").eq("id",assignmentId).maybeSingle();
 if(error || !a || a.type!=="text" || (kind==="draft"&&a.purpose!=="self_review")) return {error:"사용할 수 없는 과제입니다."};
 let source=content;
 if(kind==="draft") {
  const {data:rows,error:sourceError}=await client.from("submissions").select("assignment_id,content,version,canceled_at,assignment:assignments!inner(class_id,type)").eq("student_id",profile.id).eq("assignment.class_id",a.class_id).eq("assignment.type","text").neq("assignment_id",a.id).order("version",{ascending:false}).limit(200);
  if(sourceError) return {error:"기존 제출 글을 불러오지 못했습니다."};
  const seen=new Set<string>();
  source=(rows??[]).filter(r=>{if(seen.has(r.assignment_id)) return false;seen.add(r.assignment_id);return !r.canceled_at&&r.content;}).map(r=>r.content).join("\n\n").slice(0,12000);
  if(!source) return {error:"이 수업에 제출한 글이 아직 없습니다. 활동 내용을 직접 작성한 뒤 글 피드백을 이용해 주세요."};
 }
 if(source.trim().length<20) return {error:"20자 이상 작성해 주세요."};
 const {error:quota}=await client.rpc("reserve_ai_request",{p_kind:kind,p_target:a.id});
 if(quota) return {error:quota.code==="P0001"?quota.message:"AI 이용 횟수를 확인하지 못했습니다."};
 try {
  const text=await generateSchoolText(kind,redactPersonalData(source,[profile.name,profile.student_no??""]),a.max_chars??10000);
  return {text};
 } catch {return {error:"AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요. 작성 중인 글은 유지됩니다."};}
}
