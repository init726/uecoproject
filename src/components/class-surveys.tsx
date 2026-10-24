import {isMissingSchema} from "@/lib/schema-compat";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {formatDateTime,isPast} from "@/lib/format";
export async function ClassSurveys({classId,teacher}:{classId:string;teacher:boolean}) {
 const client=await createClient();const {data,error}=await client.from("surveys").select("id,title,due_at,closed,anonymous").eq("class_id",classId).order("created_at",{ascending:false});
 if(isMissingSchema(error,["surveys"])) return null;
 if(error)throw new Error("설문을 불러오지 못했습니다. DB 업데이트를 확인해 주세요.");
 return <section className="school-panel"><div className="school-panel-heading"><h3 className="school-panel-title">클래스 설문</h3>{teacher&&<Link href={`/classes/${classId}/surveys/new`} className="text-sm text-primary">설문 만들기</Link>}</div>{!data?.length?<p className="p-5 text-sm text-muted-foreground">등록된 설문이 없습니다.</p>:<div className="divide-y">{data.map(s=><Link key={s.id} href={`/surveys/${s.id}`} className="block p-4 hover:bg-muted/30"><p className="text-sm font-semibold">{s.title}</p><p className="mt-1 text-xs text-muted-foreground">{s.anonymous?"익명":"기명"} · {s.closed||isPast(s.due_at)?"마감됨":"응답하기"} · {formatDateTime(s.due_at)}</p></Link>)}</div>}</section>;
}
