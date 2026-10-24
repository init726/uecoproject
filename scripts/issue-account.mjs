// 터미널에서 계정 발급 (첫 관리자 계정을 만들 때 사용)
//
//   npm run issue-account -- --role admin --name 홍길동 --username hong
//   npm run issue-account -- --role teacher --name 김선생 --username kimteacher --subject 수학
//   npm run issue-account -- --role student --name 이학생 --username 202620315 --student-no 20315
//
// .env.local의 SUPABASE_SECRET_KEY가 필요하다. 웹의 "계정 발급" 화면(src/lib/accounts.ts)과 같은 방식이다.
// 발급한 계정은 첫 로그인 때 비밀번호를 바꿔야 한다.
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    role: { type: "string" },
    name: { type: "string" },
    username: { type: "string" },
    subject: { type: "string", default: "" },
    "student-no": { type: "string", default: "" },
    password: { type: "string" },
  },
});

const role = values.role;
const username = (values.username ?? "").trim().toLowerCase();
if (!["admin", "teacher", "student"].includes(role) || !values.name || !username) {
  console.error("사용법: npm run issue-account -- --role admin|teacher|student --name 이름 --username 아이디 [--subject 교과] [--student-no 20315]");
  process.exit(1);
}
if (!/^[a-z0-9_]{4,20}$/.test(username)) {
  console.error("아이디는 영문 소문자, 숫자, _ 로 4~20자예요.");
  process.exit(1);
}
if (role === "student" && !/^\d{5}$/.test(values["student-no"])) {
  console.error("학생은 --student-no 에 숫자 5자리 학번이 필요해요.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error(".env.local에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요해요.");
  process.exit(1);
}

const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const pick = (chars) => chars[randomInt(chars.length)];
const chunk = () => pick(UPPER) + pick(LOWER) + pick(LOWER) + pick(DIGITS);
const password = values.password ?? [chunk(), chunk(), chunk()].join("-");

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

// 아이디는 내부적으로 "아이디@id.invalid" 이메일로 저장한다. (src/lib/username.ts와 같은 규칙)
const { data, error } = await admin.auth.admin.createUser({
  email: `${username}@id.invalid`,
  password,
  email_confirm: true,
  app_metadata: { must_change_password: true },
  user_metadata: {
    name: values.name,
    role: role === "student" ? "student" : "teacher",
    student_no: values["student-no"],
    subject: values.subject,
    privacy_agreed: "true",
  },
});
if (error) {
  console.error("계정을 만들지 못했어요:", error.message);
  process.exit(1);
}

const { error: profileError } = await admin
  .from("profiles")
  .update({ role, approved: true })
  .eq("id", data.user.id);
if (profileError) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error("계정 정보를 저장하지 못해 되돌렸어요:", profileError.message);
  process.exit(1);
}

console.log(`발급 완료 (${role})\n  아이디:   ${username}\n  임시 비밀번호: ${password}`);
