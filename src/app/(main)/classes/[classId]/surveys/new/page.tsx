import {notFound} from "next/navigation";
import {requireRole} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {SurveyEditor} from "@/components/survey-forms";
export default async function NewSurvey(props:PageProps<"/classes/[classId]/surveys/new">){const profile=await requireRole("teacher");const {classId}=await props.params;const client=await createClient();const {data}=await client.from("classes").select("name,teacher_id").eq("id",classId).maybeSingle();if(!data||data.teacher_id!==profile.id)notFound();return <div className="mx-auto max-w-2xl space-y-6"><div><p className="eyebrow">{data.name}</p><h2 className="page-title">설문 만들기</h2></div><SurveyEditor classId={classId}/></div>;}
