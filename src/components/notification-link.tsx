import Link from "next/link";
import {Bell} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {cn} from "@/lib/utils";
// compact: 위쪽 바처럼 좁은 곳. 종 아이콘과 읽지 않은 수만 보인다.
export async function NotificationLink({compact=false}:{compact?:boolean}){const client=await createClient();const {count,error}=await client.from("learning_notifications").select("id",{count:"exact",head:true}).is("read_at",null);const unread=!error&&count?count:0;
 return <Link href="/school-notifications" className={compact?"relative flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground":"school-nav-item"} aria-label={`학교 알림${unread?` ${unread}개 읽지 않음`:""}`}>
  <Bell className={compact?"size-5":"size-4"}/>
  {!compact&&<span>학교 알림</span>}
  {unread>0&&<span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] leading-none font-semibold text-primary-foreground tabular-nums",compact?"absolute top-0.5 right-0.5":"ml-auto")}>{unread>99?"99+":unread}</span>}
 </Link>;}
