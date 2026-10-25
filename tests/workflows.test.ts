import assert from "node:assert/strict";
import {test} from "node:test";
import {redactPersonalData} from "../src/lib/school-ai-utils";
import {optionCounts,type SurveyResults} from "../src/lib/surveys";
import {getStudentAssignments} from "../src/lib/queries";

test("external AI input masks known names, student numbers, emails, phone and identity numbers",()=>{
 const result=redactPersonalData("김학생 20101 kim@school.kr 010-1234-5678 061024-3123456 토론에서 자료를 비교했다.",["김학생","20101"]);
 for(const secret of ["김학생","20101","kim@school.kr","010-1234-5678","061024-3123456"])assert.ok(!result.includes(secret));
 assert.ok(result.includes("토론에서 자료를 비교했다."));
});
test("survey chart counts multiple choices independently and ignores missing answers",()=>{
 const result:SurveyResults={count:3,withheld:false,responses:[{answers:[1,[0,2]]},{answers:[1,[2]]},{answers:[0,[]]}]};
 assert.deepEqual(optionCounts(result,0,3),[1,2,0]);assert.deepEqual(optionCounts(result,1,3),[1,0,2]);assert.deepEqual(optionCounts(result,2,3),[0,0,0]);
});
test("latest canceled submission is missing, earlier submitted version is not revived",async()=>{
 const rows=[{id:"a",title:"활동",due_at:"2027-01-01T00:00:00Z",type:"text",allow_late:true,class:{id:"c",name:"수학"},submissions:[{version:1,is_late:false,canceled_at:null},{version:2,is_late:false,canceled_at:"2026-10-25T00:00:00Z"}]}];
 const query={select(){return this;},order(){return this;},eq(){return this;},async overrideTypes(){return {data:rows,error:null};}};
 const client={from:()=>query} as unknown as Parameters<typeof getStudentAssignments>[0];
 let result=await getStudentAssignments(client,"2026-2학기");assert.equal(result[0].submitted,false);
 rows[0].submissions.push({version:3,is_late:true,canceled_at:null});
 result=await getStudentAssignments(client);assert.equal(result[0].submitted,true);assert.equal(result[0].is_late,true);
});
test("assignment query failure is not presented as an empty list",async()=>{
 const query={select(){return this;},order(){return this;},async overrideTypes(){return {data:null,error:{message:"offline"}};}};
 await assert.rejects(()=>getStudentAssignments({from:()=>query} as unknown as Parameters<typeof getStudentAssignments>[0]));
});

test("Ollama uses local chat API without an external API key",async()=>{
 const {requestOllama}=await import("../src/lib/ollama");
 let called=false;
 const text=await requestOllama("도움 지침","학생 활동",{OLLAMA_MODEL:"school-model"},async(url,init)=>{
  called=true;assert.equal(url,"http://127.0.0.1:11434/api/chat");
  const headers=init?.headers as Record<string,string>;assert.equal(headers.Authorization,undefined);
  const body=JSON.parse(String(init?.body));assert.equal(body.stream,false);assert.equal(body.model,"school-model");assert.equal(body.messages[1].content,"학생 활동");
  return new Response(JSON.stringify({done:true,done_reason:"stop",message:{content:"구체적인 활동을 보완해 보세요."}}),{status:200});
 });
 assert.ok(called);assert.equal(text,"구체적인 활동을 보완해 보세요.");
});
test("remote Ollama gateway requires HTTPS and sends the token",async()=>{
 const {requestOllama,ollamaConfiguration}=await import("../src/lib/ollama");
 assert.throws(()=>ollamaConfiguration({OLLAMA_MODEL:"m",OLLAMA_BASE_URL:"https://ai.example.ts.net"}),"remote without token");
 assert.throws(()=>ollamaConfiguration({OLLAMA_MODEL:"m",OLLAMA_BASE_URL:"http://ai.example.ts.net",OLLAMA_API_KEY:"k"}),"remote over plain http");
 let auth="";
 await requestOllama("s","u",{OLLAMA_MODEL:"m",OLLAMA_BASE_URL:"https://ai.example.ts.net",OLLAMA_API_KEY:"secret-token"},async(url,init)=>{
  assert.equal(url,"https://ai.example.ts.net/api/chat");auth=(init?.headers as Record<string,string>).Authorization;
  return new Response(JSON.stringify({done:true,done_reason:"stop",message:{content:"ok"}}),{status:200});
 });
 assert.equal(auth,"Bearer secret-token");
});
test("Ollama rejects missing model, cloud model, incomplete output and server errors",async()=>{
 const {requestOllama,ollamaConfiguration}=await import("../src/lib/ollama");
 assert.equal(ollamaConfiguration({}),null);assert.throws(()=>ollamaConfiguration({OLLAMA_MODEL:"model:cloud"}));
 assert.throws(()=>ollamaConfiguration({OLLAMA_MODEL:"model",OLLAMA_BASE_URL:"https://ollama.com"}));
 await assert.rejects(()=>requestOllama("s","u",{OLLAMA_MODEL:"model"},async()=>new Response(JSON.stringify({done:true,done_reason:"length",message:{content:"잘린 응답"}}))));
 await assert.rejects(()=>requestOllama("s","u",{OLLAMA_MODEL:"model"},async()=>new Response("offline",{status:503})));
});

test("legacy schema still loads existing assignments and latest submission status", async()=>{
 const selections:string[]=[];
 const query={
  select(columns:string){selections.push(columns);return this;},order(){return this;},eq(){return this;},
  async overrideTypes(){return selections.at(-1)!.includes("canceled_at")?{data:null,error:{code:"42703",message:"column submissions_1.canceled_at does not exist"}}:{data:[{id:"legacy",title:"기존 과제",submissions:[{version:1,is_late:true}]}],error:null};},
 };
 const rows=await getStudentAssignments({from:()=>query} as unknown as Parameters<typeof getStudentAssignments>[0],"2026-2학기");
 assert.equal(selections.length,2);assert.equal(rows[0].submitted,true);assert.equal(rows[0].is_late,true);assert.equal(rows[0].title,"기존 과제");
});
test("schema fallback never masks network, permission, or unrelated missing column errors", async()=>{
 const {withSchemaFallback}=await import("../src/lib/schema-compat");
 for(const error of [{code:"42501",message:"permission denied canceled_at"},{code:"",message:"network canceled_at"},{code:"42703",message:"column unrelated does not exist"}]){
  let calls=0;const result=await withSchemaFallback(async()=>{calls++;return {data:null,error};},["canceled_at"]);assert.equal(calls,1);assert.equal(result.error,error);
 }
});
test("development limiter retains five-attempt limit and expiration before DB upgrade",async()=>{
 const {reserveDevelopmentRequest,clearDevelopmentRequest}=await import("../src/lib/local-request-limit");
 const key="test-legacy-login";clearDevelopmentRequest(key);
 for(let i=0;i<5;i++)assert.equal(reserveDevelopmentRequest(key,5,900,1000),true);
 assert.equal(reserveDevelopmentRequest(key,5,900,1000),false);
 assert.equal(reserveDevelopmentRequest(key,5,900,902000),true);
 clearDevelopmentRequest(key);
});

test("missing school notification table and read RPC are recognized without hiding connection errors",async()=>{
 const {isMissingSchema}=await import("../src/lib/schema-compat");
 assert.equal(isMissingSchema({code:"PGRST205",message:"Could not find the table 'public.learning_notifications' in the schema cache"},["learning_notifications"]),true);
 assert.equal(isMissingSchema({code:"42P01",message:'relation "public.learning_notifications" does not exist'},["learning_notifications"]),true);
 assert.equal(isMissingSchema({code:"PGRST200",message:"Could not find a relationship between 'posts' and 'post_reads' in the schema cache"},["post_reads"]),true);
 assert.equal(isMissingSchema({code:"PGRST202",message:"Could not find the function public.mark_learning_notifications_read"},["mark_learning_notifications_read"]),true);
 assert.equal(isMissingSchema({code:"42501",message:"permission denied for table learning_notifications"},["learning_notifications"]),false);
 assert.equal(isMissingSchema({code:"",message:"network unavailable"},["learning_notifications"]),false);
});
