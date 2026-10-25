import Link from "next/link";
import {notFound} from "next/navigation";
import {getProfile} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {formatDateTime,isPast} from "@/lib/format";
import {optionCounts,type Survey,type SurveyResults} from "@/lib/surveys";
import {SurveyResponseForm,SurveyClose,SurveySummary} from "@/components/survey-forms";
// 이 화면의 AI 서버 동작(학교 AI 컴퓨터의 Ollama)은 수십 초 걸릴 수 있다. 배포 환경의 실행 시간 제한을 늘린다.
export const maxDuration = 150;

export default async function SurveyPage(props:PageProps<"/surveys/[surveyId]">) {
 const {surveyId}=await props.params;const client=await createClient();
 // 1단계: 내 정보와 설문을 동시에. (설문을 읽어야 어느 수업인지 알 수 있다)
 const [profile,{data:survey,error}]=await Promise.all([getProfile(),client.from("surveys").select("id,class_id,title,questions,anonymous,due_at,closed").eq("id",surveyId).maybeSingle<Survey>()]);
 if(error)throw new Error("설문 조회에 실패했습니다. DB 업데이트를 확인해 주세요.");if(!survey)notFound();
 const admin = profile.role === "admin";
 // 2단계: 수업 이름·관리자 목록·내 응답·결과를 동시에. 설문이 보이는 교사는 RLS상 그 수업 담당 교사뿐이라 역할로 미리 정할 수 있다.
 const none={data:null,error:null};
 const [{data:klass},catalog,mine,resultRows]=await Promise.all([
  client.from("classes").select("name,teacher_id").eq("id",survey.class_id).single(),
  admin ? client.rpc("admin_survey_catalog") : Promise.resolve(none),
  profile.role==="student" ? client.rpc("my_survey_response",{p_survey_id:survey.id}) : Promise.resolve(none),
  profile.role==="teacher"||admin ? client.rpc("survey_results",{p_survey_id:survey.id}) : Promise.resolve(none),
 ]);
 const adminClass = (catalog.data as {id:string;class_name:string}[]|null)?.find(s=>s.id===survey.id);
 if(!klass && !adminClass)notFound();
 const teacher=klass?.teacher_id===profile.id;const ended=survey.closed||isPast(survey.due_at);
 const {data:previous,error:previousError}=!teacher&&profile.role==="student"?mine:none;
 if(previousError)throw new Error("내 응답을 불러오지 못했습니다.");
 const {data,error:resultsError}=teacher||admin?resultRows:none;if(resultsError)throw new Error("설문 결과를 불러오지 못했습니다.");const results=data as SurveyResults|null;
 return <div className="mx-auto max-w-3xl space-y-6"><div><Link href={admin?"/admin/surveys":`/classes/${survey.class_id}`} className="text-sm text-muted-foreground">← {klass?.name??adminClass?.class_name}</Link><h2 className="page-title mt-2">{survey.title}</h2><p className="mt-2 text-sm text-muted-foreground">{survey.anonymous?"익명 설문":"기명 설문"} · {ended?"마감됨":"진행 중"} · {formatDateTime(survey.due_at)}</p></div>{teacher&&!ended&&<SurveyClose id={survey.id}/>}{results?<><p className="text-sm">응답 {results.count}명</p>{results.withheld?<p className="school-panel p-5 text-sm">익명 응답은 설문 마감 후 3명 이상일 때 공개됩니다.</p>:<>{teacher&&<SurveySummary id={survey.id}/>}{survey.questions.map((q,i)=><section key={i} className="school-panel p-5 space-y-3"><h3 className="font-semibold">{i+1}. {q.title}</h3>{q.type==="text"?<ul className="space-y-3">{results.responses.map((r,n)=><li key={n} className="rounded border p-3 whitespace-pre-wrap text-sm">{!survey.anonymous&&<p className="mb-1 text-xs text-muted-foreground">{r.student_no} {r.name}</p>}{String(r.answers[i])}</li>)}</ul>:optionCounts(results,i,q.options!.length).map((count,n)=><div key={n}><div className="mb-1 flex justify-between gap-2 text-sm"><span>{q.options![n]}</span><span>{count}명</span></div><div className="h-2 rounded bg-muted" role="meter" aria-label={q.options![n]} aria-valuenow={count} aria-valuemin={0} aria-valuemax={Math.max(results.count,1)}><div className="h-2 rounded bg-primary" style={{width:`${results.count?count/results.count*100:0}%`}}/></div></div>)}</section>)}{!survey.anonymous&&<section className="school-panel p-5"><h3 className="font-semibold">기명 응답 상세</h3>{results.responses.map((r,i)=><details key={i} className="border-b py-3"><summary>{r.student_no} {r.name}</summary>{survey.questions.map((q,n)=><p key={n} className="mt-2 text-sm">{q.title}: {q.type==="text"?String(r.answers[n]):(Array.isArray(r.answers[n])?r.answers[n] as number[]:[r.answers[n] as number]).map(v=>q.options?.[v]).join(", ")}</p>)}</details>)}</section>}</>}</>:ended?<div className="school-panel p-5"><p>마감된 설문입니다.</p>{previous&&<p className="mt-2 text-sm text-muted-foreground">내 응답은 저장되어 있습니다.</p>}</div>:<><p className="text-sm text-muted-foreground">{survey.anonymous?"담당 교사에게 이름·학번·응답 시각이 공개되지 않습니다. 중복 응답 방지를 위한 계정 연결은 서버에 보관합니다. 본문에 본인이나 친구를 식별할 내용을 적지 마세요.":"이 설문은 기명이며 이름·학번과 응답이 담당 교사에게 표시됩니다."}</p><SurveyResponseForm survey={survey} previous={previous}/></>}</div>;
}
