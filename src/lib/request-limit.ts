import "server-only";
import {isMissingSchema} from "./schema-compat";
import {reserveDevelopmentRequest,clearDevelopmentRequest} from "./local-request-limit";
import {createHmac} from "node:crypto";
import {headers} from "next/headers";
import {createAdminClient} from "@/lib/supabase/admin";
export async function reservePublicRequest(kind:string,identity:string,limit:number,seconds:number) {
 const secret=process.env.SUPABASE_SECRET_KEY;if(!secret)throw new Error("계정 서비스를 준비 중입니다.");
 const requestHeaders=await headers();
 // 배포 환경이 신뢰할 수 있는 프록시에서 헤더를 덮어쓰는 경우에만 IP 제한을 추가한다.
 const ip=process.env.TRUST_PROXY_IP==="true"?requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown":"local";
 const key=createHmac("sha256",secret).update(`${kind}:${identity.toLowerCase().trim()}`).digest("hex");
 const admin=createAdminClient();
 const {data,error}=await admin.rpc("reserve_request",{p_key:key,p_limit:limit,p_seconds:seconds});
 if(process.env.NODE_ENV === "development" && isMissingSchema(error,["reserve_request"])) {
  return {allowed:reserveDevelopmentRequest(key,limit,seconds),key:`development:${key}`};
 }
 if(error)throw new Error("계정 요청을 확인하지 못했습니다. 관리자에게 문의해 주세요.");
 if(!data)return {allowed:false,key};
 if(process.env.TRUST_PROXY_IP==="true") {const ipKey=createHmac("sha256",secret).update(`${kind}:ip:${ip}`).digest("hex");const result=await admin.rpc("reserve_request",{p_key:ipKey,p_limit:Math.max(limit*10,30),p_seconds:seconds});if(result.error||!result.data)return {allowed:false,key};}
 return {allowed:true,key};
}
export async function clearRequestLimit(key:string){if(key.startsWith("development:")){clearDevelopmentRequest(key.slice("development:".length));return;}const {error}=await createAdminClient().from("request_limits").delete().eq("key",key);if(error)console.error("Could not clear request limit");}
