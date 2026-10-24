import { createHmac, timingSafeEqual } from "node:crypto";
import type { SchoolImportPlan } from "./school-import";

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update("school-import-v1:").update(body).digest();
}

export function signSchoolImport(plan: SchoolImportPlan, adminId: string, secret: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ plan, adminId, expires: now + 60 * 60 * 1000 })).toString("base64url");
  if (body.length > 799900) throw new Error("가져오기 자료가 너무 큽니다. 명단을 나눠 올려 주세요.");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

export function verifySchoolImport(token: string, adminId: string, secret: string, now = Date.now()): SchoolImportPlan {
  const invalid = () => new Error("검토 정보가 만료되었거나 변경되었습니다. 파일을 다시 검토해 주세요.");
  if (typeof token !== "string" || token.length > 800000) throw invalid();
  const parts = token.split(".");
  const [body, signature] = parts;
  if (!body || !signature || parts.length !== 2) throw invalid();
  const expected = sign(body, secret);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.adminId !== adminId || typeof payload.expires !== "number" || payload.expires <= now) throw invalid();
  return payload.plan;
}
