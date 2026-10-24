"use server";
import {requireAdmin} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {revalidatePath} from "next/cache";
import type {ActionState} from "@/lib/types";
export async function resolveRecovery(id:string,_prev:ActionState,formData:FormData):Promise<ActionState>{await requireAdmin();const status=formData.get("status");if(status!=="resolved"&&status!=="rejected")return {error:"처리 결과를 선택해 주세요."};const client=await createClient();const {error}=await client.from("account_recovery_requests").update({status}).eq("id",id);if(error)return {error:"저장하지 못했습니다."};revalidatePath("/admin/recovery");return {message:"처리 결과를 저장했습니다."};}
