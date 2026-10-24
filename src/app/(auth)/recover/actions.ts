"use server";
import {reservePublicRequest} from "@/lib/request-limit";
import {createAdminClient} from "@/lib/supabase/admin";
import {normalizeUsername,validateUsername} from "@/lib/username";
import type {ActionState} from "@/lib/types";
export async function requestRecovery(_prev:ActionState,formData:FormData):Promise<ActionState>{
 const username=normalizeUsername(String(formData.get("username")??""));const name=String(formData.get("name")??"").trim();const studentNo=String(formData.get("student_no")??"").trim();
 if(validateUsername(username)||!name||name.length>50||studentNo.length>20)return {error:"아이디·이름·학번을 확인해 주세요."};
 try{const limit=await reservePublicRequest("recovery",username,2,3600);if(!limit.allowed)return {error:"요청이 많습니다. 1시간 후 다시 시도하거나 학교에 문의해 주세요."};const {error}=await createAdminClient().from("account_recovery_requests").insert({username,name,student_no:studentNo||null});if(error)return {error:"요청을 저장하지 못했습니다. 학교에 직접 문의해 주세요."};return {message:"복구 요청을 접수했습니다. 학교 담당자에게 본인 확인을 받은 뒤 임시 비밀번호를 전달받으세요. 계정 존재 여부는 이 화면에서 안내하지 않습니다."};}catch(e){return {error:e instanceof Error?e.message:"요청하지 못했습니다."};}
}
