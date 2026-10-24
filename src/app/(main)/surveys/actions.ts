"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {requireRole} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {kstLocalToIso} from "@/lib/format";
import type {ActionState} from "@/lib/types";
import {generateSchoolText,redactPersonalData,schoolAiReady} from "@/lib/school-ai";
import type {SurveyResults} from "@/lib/surveys";

export async function createSurvey(classId:string,_prev:ActionState,formData:FormData):Promise<ActionState> {
 await requireRole("teacher");const client=await createClient();
 const due=kstLocalToIso(String(formData.get("due_at")??""));if(!due) return {error:"마감일을 확인해 주세요."};
 let questions:unknown;try{questions=JSON.parse(String(formData.get("questions")??""));}catch{return {error:"질문 형식을 확인해 주세요."};}
 const {data,error}=await client.rpc("create_survey",{p_class_id:classId,p_title:String(formData.get("title")??"").slice(0,100),p_questions:questions,p_anonymous:formData.get("anonymous")==="on",p_due_at:due});
 if(error)return {error:error.code==="P0001"?error.message:"설문을 만들지 못했습니다. DB 업데이트를 확인해 주세요."};
 revalidatePath(`/classes/${classId}`);redirect(`/surveys/${data}`);
}
export async function submitSurvey(surveyId:string,_prev:ActionState,formData:FormData):Promise<ActionState> {
 await requireRole("student");const client=await createClient();
 let answers:unknown;try{answers=JSON.parse(String(formData.get("answers")??""));}catch{return {error:"응답을 확인해 주세요."};}
 const {error}=await client.rpc("submit_survey",{p_survey_id:surveyId,p_answers:answers});
 if(error)return {error:error.code==="P0001"?error.message:"응답을 저장하지 못했습니다."};
 revalidatePath(`/surveys/${surveyId}`);return {message:"응답을 저장했습니다. 마감 전까지 수정할 수 있습니다."};
}
export async function closeSurvey(surveyId:string,_prev:ActionState):Promise<ActionState> {
 void _prev;
 await requireRole("teacher");const client=await createClient();const {error}=await client.rpc("close_survey",{p_survey_id:surveyId});
 if(error)return {error:"설문을 마감하지 못했습니다."};revalidatePath(`/surveys/${surveyId}`);return {message:"설문을 마감했습니다."};
}
export async function summarizeSurvey(surveyId:string,consent:boolean):Promise<{text?:string;error?:string}> {
 const profile=await requireRole("teacher");if(!consent)return {error:"AI 처리 안내를 확인해 주세요."};
 if(!schoolAiReady())return {error:"학교에서 AI 연결을 준비하고 있습니다."};
 const client=await createClient();const {data:survey}=await client.from("surveys").select("teacher:classes!inner(teacher_id),class_id,questions").eq("id",surveyId).maybeSingle();
 // 결과 RPC도 권한과 익명 공개 기준을 검사한다.
 if(!survey)return {error:"설문을 찾을 수 없습니다."};
 const {data,error}=await client.rpc("survey_results",{p_survey_id:surveyId});const results=data as SurveyResults|null;
 if(error||!results||results.withheld||!results.count)return {error:"공개 가능한 설문 응답이 없습니다."};
 const {data:members,error:memberError}=await client.from("enrollments").select("student:profiles!enrollments_student_id_fkey(name,student_no)").eq("class_id",survey.class_id).overrideTypes<{student:{name:string;student_no:string|null}|null}[],{merge:false}>();
 if(memberError)return {error:"개인정보 가림 처리를 준비하지 못했습니다."};
 const names=[profile.name,...(members??[]).flatMap(m=>[m.student?.name??"",m.student?.student_no??""])];
 const questions=survey.questions as {title:string;type:string}[];
 const source=questions.map((q,i)=>q.type==="text"?`질문 ${i+1}: ${q.title}\n`+results.responses.map(r=>r.answers[i]).filter(a=>typeof a==="string").join("\n"):"").filter(Boolean).join("\n\n");
 if(!source)return {error:"요약할 주관식 질문이 없습니다."};
 const {error:quota}=await client.rpc("reserve_ai_request",{p_kind:"summary",p_target:surveyId});if(quota)return {error:quota.code==="P0001"?quota.message:"이용 한도를 확인하지 못했습니다."};
 try{return {text:await generateSchoolText("summary",redactPersonalData(source,names))};}catch{return {error:"AI 요약에 실패했습니다. 원본 결과는 계속 확인할 수 있습니다."};}
}
