"use server";
import {isMissingSchema} from "@/lib/schema-compat";
import {getProfile} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {revalidatePath} from "next/cache";
import type {ActionState} from "@/lib/types";
export async function markRead(_prev:ActionState):Promise<ActionState>{void _prev;await getProfile();const client=await createClient();const {error}=await client.rpc("mark_learning_notifications_read");if(isMissingSchema(error,["mark_learning_notifications_read","learning_notifications"]))return {error:"학교 알림을 준비하고 있습니다. 잠시 후 다시 확인해 주세요."};if(error)return {error:"읽음 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."};revalidatePath("/", "layout");return {message:"모두 읽음 처리했습니다."};}
