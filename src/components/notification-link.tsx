import Link from "next/link";
import {Bell} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
export async function NotificationLink(){const client=await createClient();const {count,error}=await client.from("learning_notifications").select("id",{count:"exact",head:true}).is("read_at",null);return <Link href="/school-notifications" className="flex min-h-11 items-center gap-2 rounded px-2 text-sm" aria-label={`학교 알림${!error&&count?` ${count}개 읽지 않음`:""}`}><Bell className="size-5"/><span className="text-xs">{!error&&count?count>99?"99+":count:"학교 알림"}</span></Link>;}
