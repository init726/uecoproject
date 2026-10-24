// 커뮤니티 DB 규칙 테스트: npm run test:community
// schema.sql 위에 community.sql을 얹은 가짜 Postgres(PGlite)에서,
// 학생·교사·관리자로 번갈아 로그인한 것처럼 RLS·트리거·함수가 제대로 막는지 확인한다.
// community.sql을 고치면 꼭 다시 돌려 볼 것.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const [schemaPath, communityPath] = process.argv.slice(2);
const db = new PGlite();

const stub = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable
  as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.extension(name text) returns text language sql immutable
  as $$ select reverse(split_part(reverse(name), '.', 1)) $$;
grant usage on schema public, auth, storage to anon, authenticated;
grant select, insert, update, delete on all tables in schema storage to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

await db.exec(stub);
await db.exec(readFileSync(schemaPath, "utf8"));
await db.exec(readFileSync(communityPath, "utf8"));
console.log("schema + community applied OK");

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

async function as(uid, fn) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  await db.query(uid ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.query("reset role");
  }
}
async function expectError(promise, msg, match) {
  try {
    await promise;
    ok(false, `${msg} (expected error, got success)`);
  } catch (e) {
    const text = e.message.split("\n")[0];
    ok(match ? text.includes(match) : true, `${msg} -> ${text}`);
  }
}
async function signup(email, meta) {
  const r = await db.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify(meta)],
  );
  return r.rows[0].id;
}
const q = (uid, sql, params = []) => as(uid, () => db.query(sql, params));

// --- 사용자 ---
const T = await signup("t@school.kr", { name: "김교사", role: "teacher", subject: "수학", privacy_agreed: "true" });
await db.query("update public.profiles set approved = true where id = $1", [T]);
const T2 = await signup("t2@school.kr", { name: "미승인교사", role: "teacher", subject: "영어", privacy_agreed: "true" });
const S = [];
for (let i = 1; i <= 6; i++) {
  S.push(await signup(`s${i}@school.kr`, { name: `학생${i}`, role: "student", student_no: `2030${i}`, privacy_agreed: "true" }));
}
const [S1, S2, S3, S4, S5, S6] = S;
const A = await signup("a@school.kr", { name: "관리자", role: "student", privacy_agreed: "true" });
await db.query("update public.profiles set role = 'admin', approved = true where id = $1", [A]);

const insertPost = (uid, kind, title = "제목", body = "본문", extra = "") =>
  q(uid, `insert into public.posts (author_id, kind, title, body${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, $3, $4${extra ? ", " + extra.split("=")[1] : ""}) returning *`, [uid, kind, title, body]);

// --- 글 작성 규칙 ---
const p1 = (await insertPost(S1, "question", "수학 질문", "이거 어떻게 풀어요?")).rows[0];
ok(p1.status === "published" && p1.author_name === "학생1" && p1.author_role === "student", "student writes a question; name/role filled by server");
ok(!("student_no" in p1) && !JSON.stringify(p1).includes("20301"), "post does not carry student number");
const spoof = (await q(S1, `insert into public.posts (author_id, kind, title, body, author_name, author_role, status, created_at)
  values ($1, 'free', '위조', '본문', '관리자', 'admin', 'review', '2000-01-01') returning *`, [S1])).rows[0];
ok(spoof.author_name === "학생1" && spoof.author_role === "student" && spoof.status === "published" && spoof.created_at.getFullYear() > 2000,
  "spoofed name/role/status/time are overwritten");
const forged = (await q(S2, "insert into public.posts (author_id, kind, title, body) values ($1, 'free', 'a', 'b') returning author_id, author_name", [S1])).rows[0];
ok(forged.author_id === S2 && forged.author_name === "학생2", "post forged as another user is stored under the real author");
await expectError(insertPost(S1, "notice", "가짜 공지", "x"), "student cannot write school notice", "관리자만");
await expectError(insertPost(T, "notice", "교사 공지", "x"), "teacher cannot write school notice", "관리자만");
ok((await insertPost(T, "free", "교사 자유글", "안녕")).rows.length === 1, "approved teacher writes a free post");
await expectError(insertPost(T2, "free", "미승인", "x"), "unapproved teacher cannot write", "승인");
await expectError(insertPost(A, "question", "관리자 질문", "x"), "admin cannot write a question", "공지만");
await expectError(insertPost(S1, "free", "   ", "x"), "blank title rejected");
await expectError(insertPost(S1, "free", "t", "가".repeat(5001)), "body over 5000 chars rejected");
const notice = (await q(A, "insert into public.posts (author_id, kind, title, body, pinned) values ($1, 'notice', '시험 안내', '다음 주 시험', true) returning *", [A])).rows[0];
ok(notice.pinned === true && notice.author_role === "admin", "admin writes a pinned notice");
const fakePin = (await q(S1, "insert into public.posts (author_id, kind, title, body, pinned) values ($1, 'free', '고정 시도', 'x', true) returning pinned", [S1])).rows[0];
ok(fakePin.pinned === false, "student's pinned flag is ignored on insert");
await expectError(q(A, "update public.posts set pinned = false where id = $1", [notice.id]), "even the author cannot flip pinned directly", "제목과 내용만");

// --- 조회 ---
ok((await q(S2, "select * from public.posts")).rows.length >= 4, "any logged-in user reads published posts");
await expectError(as(null, () => db.query("select * from public.posts")), "anon cannot read posts");

// --- 본인 글 수정 ---
const edit = await q(S1, "update public.posts set title = '수정된 제목', body = '수정된 본문' where id = $1", [p1.id]);
ok(edit.affectedRows === 1, "author edits own title/body");
const edited = (await q(S1, "select * from public.posts where id = $1", [p1.id])).rows[0];
ok(edited.updated_at >= edited.created_at && edited.title === "수정된 제목", "updated_at refreshed");
ok((await q(S2, "update public.posts set title = '남의 글 수정' where id = $1", [p1.id])).affectedRows === 0, "other student cannot edit my post");
ok((await q(T, "update public.posts set title = '교사가 수정' where id = $1", [p1.id])).affectedRows === 0, "teacher cannot edit student's post");
ok((await q(A, "update public.posts set title = '관리자가 수정' where id = $1", [p1.id])).affectedRows === 0, "admin cannot edit others' content");
await expectError(q(S1, "update public.posts set status = 'deleted' where id = $1", [p1.id]), "author cannot set status directly", "제목과 내용만");
await expectError(q(S1, "update public.posts set kind = 'notice' where id = $1", [p1.id]), "author cannot change kind", "제목과 내용만");
await expectError(q(S1, "update public.posts set author_name = '관리자' where id = $1", [p1.id]), "author cannot change author_name", "제목과 내용만");
await expectError(q(S1, "delete from public.posts where id = $1", [p1.id]), "direct DELETE on posts is blocked");

// --- 댓글 ---
const c1 = (await q(S2, "insert into public.comments (post_id, author_id, body) values ($1, $2, '이렇게 풀어요') returning *", [p1.id, S2])).rows[0];
ok(c1.author_name === "학생2" && c1.status === "published", "comment author/status filled by server");
ok(!("parent_id" in c1), "comments are single-level (no parent column)");
const forgedC = (await q(S2, "insert into public.comments (post_id, author_id, body) values ($1, $2, 'x') returning author_id", [p1.id, S3])).rows[0];
ok(forgedC.author_id === S2, "comment forged as another user is stored under the real author");
await expectError(q(S2, "insert into public.comments (post_id, author_id, body) values ($1, $2, '  ')", [p1.id, S2]), "blank comment rejected");
await expectError(q(S2, "update public.comments set body = '수정' where id = $1", [c1.id]), "comments cannot be edited");
await expectError(q(S2, "delete from public.comments where id = $1", [c1.id]), "direct DELETE on comments is blocked");
await expectError(q(S3, "select public.delete_comment($1)", [c1.id]), "other user cannot delete my comment", "삭제할 수 없는");
await q(S2, "select public.delete_comment($1)", [c1.id]);
ok((await q(S3, "select * from public.comments where id = $1", [c1.id])).rows.length === 0, "deleted comment disappears for others");
ok((await q(A, "select * from public.comments where id = $1 and status = 'deleted'", [c1.id])).rows.length === 1, "admin still sees deleted comment");

// --- 본인 글 삭제 ---
const pDel = (await insertPost(S3, "free", "지울 글", "x")).rows[0];
await expectError(q(S4, "select public.delete_post($1)", [pDel.id]), "other user cannot delete my post", "삭제할 수 없는");
await q(S3, "select public.delete_post($1)", [pDel.id]);
ok((await q(S4, "select * from public.posts where id = $1", [pDel.id])).rows.length === 0, "deleted post hidden from others");
ok((await q(S3, "select * from public.posts where id = $1", [pDel.id])).rows.length === 0, "deleted post hidden from author too");
ok((await q(A, "select * from public.posts where id = $1", [pDel.id])).rows.length === 1, "admin still sees deleted post");
ok((await q(S3, "update public.posts set title = '부활' where id = $1", [pDel.id])).affectedRows === 0, "deleted post cannot be edited");
await expectError(q(S4, "insert into public.comments (post_id, author_id, body) values ($1, $2, 'x')", [pDel.id, S4]), "cannot comment on deleted post", "댓글을 달 수 없는");

// --- 신고 ---
const target = (await insertPost(S1, "free", "문제 글", "부적절한 내용")).rows[0];
const cTarget = (await q(S2, "insert into public.comments (post_id, author_id, body) values ($1, $2, '부적절한 댓글') returning id", [target.id, S2])).rows[0];
await expectError(q(S1, "select public.report_content($1, null, '사유')", [target.id]), "cannot report own post", "내 글");
await expectError(q(S2, "select public.report_content($1, $2, '사유')", [target.id, cTarget.id]), "report needs exactly one target", "올바르지");
await expectError(q(S3, "select public.report_content($1, null, '   ')", [target.id]), "empty reason rejected", "사유");
await q(S3, "select public.report_content($1, null, '욕설')", [target.id]);
await expectError(q(S3, "select public.report_content($1, null, '또 신고')", [target.id]), "same user cannot report the same post twice", "이미 신고");
ok((await q(S3, "select * from public.reports")).rows.length === 1, "reporter can see only own reports");
ok((await q(S4, "select * from public.reports")).rows.length === 0, "other users cannot see reports");
await expectError(q(S3, "insert into public.reports (post_id, reporter_id, reason) values ($1, $2, 'x')", [target.id, S3]), "direct report insert is blocked");
await q(S4, "select public.report_content($1, null, '광고')", [target.id]);
ok((await q(S5, "select status from public.posts where id = $1", [target.id])).rows[0]?.status === "published", "2 reports do not hide the post");
await q(S5, "select public.report_content($1, null, '비방')", [target.id]);
ok((await q(S6, "select * from public.posts where id = $1", [target.id])).rows.length === 0, "3 distinct reports hide the post from users");
ok((await q(S1, "select status from public.posts where id = $1", [target.id])).rows[0]?.status === "review", "author still sees own post as 'review'");
ok((await q(S6, "select * from public.comments where post_id = $1", [target.id])).rows.length === 0, "comments of a hidden post are hidden too");
await expectError(q(S6, "insert into public.comments (post_id, author_id, body) values ($1, $2, 'x')", [target.id, S6]), "cannot comment on a hidden post");
await expectError(q(S1, "update public.posts set title = '검토 회피' where id = $1", [target.id]), "author cannot edit a post under review", "수정할 수 없는");
await expectError(q(S1, "select public.delete_post($1)", [target.id]), "author cannot delete a post under review", "삭제할 수 없는");
const auto = (await q(A, "select * from public.moderation_logs where post_id = $1", [target.id])).rows;
ok(auto.length === 1 && auto[0].action === "auto_hide" && auto[0].actor_id === null, "auto-hide is logged with no actor");
ok((await q(S1, "select * from public.moderation_logs")).rows.length === 0, "users cannot read moderation logs");

// 신고 3회로 영구 삭제되지 않는다
ok((await q(A, "select status from public.posts where id = $1", [target.id])).rows[0].status === "review", "post is under review, not deleted");

// --- 관리자 처리 ---
await expectError(q(S1, "select public.moderate_content($1, null, 'restore', '사유')", [target.id]), "non-admin cannot moderate", "관리자만");
await expectError(q(A, "select public.moderate_content($1, null, 'restore', '  ')", [target.id]), "moderation needs a reason", "사유");
await expectError(q(A, "select public.moderate_content($1, null, 'hide', '사유')", [target.id]), "cannot hide what is already hidden", "현재 상태");
await q(A, "select public.moderate_content($1, null, 'restore', '문제 없음')", [target.id]);
ok((await q(S6, "select * from public.posts where id = $1", [target.id])).rows.length === 1, "admin restore makes post visible again");
const logs = (await q(A, "select * from public.moderation_logs where post_id = $1 order by created_at, id", [target.id])).rows;
const restoreLog = logs.find((l) => l.action === "restore");
ok(restoreLog && restoreLog.actor_id === A && restoreLog.reason === "문제 없음" && restoreLog.created_at, "restore log records admin, reason and time");
const open = (await q(A, "select count(*)::int as n from public.reports where post_id = $1 and handled_at is null", [target.id])).rows[0].n;
ok(open === 0, "restore marks reports as handled");
await expectError(q(S3, "select public.report_content($1, null, '재신고')", [target.id]), "previous reporter still cannot report again after restore", "이미 신고");
// 복구 뒤 새 신고 1건은 이전 3건을 다시 세지 않는다
await q(S6, "select public.report_content($1, null, '새 신고')", [target.id]);
ok((await q(S2, "select status from public.posts where id = $1", [target.id])).rows[0]?.status === "published", "old handled reports do not re-trigger auto-hide");

await q(A, "select public.moderate_content($1, null, 'hide', '확인 필요')", [target.id]);
ok((await q(S2, "select * from public.posts where id = $1", [target.id])).rows.length === 0, "admin can hide manually");
await q(A, "select public.moderate_content($1, null, 'delete', '규정 위반')", [target.id]);
ok((await q(A, "select status from public.posts where id = $1", [target.id])).rows[0].status === "deleted", "admin deletes");
await expectError(q(A, "select public.moderate_content($1, null, 'restore', '되살리기')", [target.id]), "deleted post cannot be restored", "현재 상태");
const all = (await q(A, "select action from public.moderation_logs where post_id = $1", [target.id])).rows.map((r) => r.action);
ok(["auto_hide", "restore", "hide", "delete"].every((a) => all.includes(a)), `full moderation history kept: ${all}`);
await expectError(q(A, "update public.moderation_logs set reason = '조작' where post_id = $1", [target.id]), "admin cannot rewrite moderation logs");
await expectError(q(A, "delete from public.moderation_logs"), "admin cannot delete moderation logs");

// 댓글 신고도 같은 규칙
const post2 = (await insertPost(S1, "free", "댓글 신고용", "x")).rows[0];
const cBad = (await q(S2, "insert into public.comments (post_id, author_id, body) values ($1, $2, '나쁜 댓글') returning id", [post2.id, S2])).rows[0];
await expectError(q(S2, "select public.report_content(null, $1, '사유')", [cBad.id]), "cannot report own comment", "내 글");
for (const u of [S3, S4]) await q(u, "select public.report_content(null, $1, '사유')", [cBad.id]);
await expectError(q(S3, "select public.report_content(null, $1, '사유')", [cBad.id]), "duplicate comment report blocked", "이미 신고");
ok((await q(S5, "select * from public.comments where id = $1", [cBad.id])).rows.length === 1, "2 reports keep the comment visible");
await q(S5, "select public.report_content(null, $1, '사유')", [cBad.id]);
ok((await q(S6, "select * from public.comments where id = $1", [cBad.id])).rows.length === 0, "3 reports hide the comment");
ok((await q(S6, "select * from public.posts where id = $1", [post2.id])).rows.length === 1, "the post itself stays visible");
await q(A, "select public.moderate_content(null, $1, 'delete', '욕설 확인')", [cBad.id]);
ok((await q(A, "select status from public.comments where id = $1", [cBad.id])).rows[0].status === "deleted", "admin deletes comment");

// --- 공지 고정 ---
await expectError(q(S1, "select public.set_post_pinned($1, true)", [p1.id]), "student cannot pin", "관리자만");
await expectError(q(A, "select public.set_post_pinned($1, true)", [p1.id]), "only notices can be pinned", "고정할 수 없는");
await q(A, "select public.set_post_pinned($1, false)", [notice.id]);
ok((await q(S1, "select pinned from public.posts where id = $1", [notice.id])).rows[0].pinned === false, "admin unpins a notice");

// --- 이용 정지 ---
await expectError(q(S1, "select public.set_user_suspended($1, true)", [S6]), "student cannot suspend", "관리자만");
await expectError(q(A, "select public.set_user_suspended($1, true)", [A]), "admin account cannot be suspended", "정지할 수 없는");
await q(A, "select public.set_user_suspended($1, true)", [S6]);
await expectError(insertPost(S6, "free", "정지 중", "x"), "suspended user cannot post", "정지");
await expectError(q(S6, "insert into public.comments (post_id, author_id, body) values ($1, $2, 'x')", [p1.id, S6]), "suspended user cannot comment", "정지");
await expectError(q(S6, "select public.report_content($1, null, '사유')", [p1.id]), "suspended user cannot report", "신고할 수 없는");
await q(A, "select public.set_user_suspended($1, false)", [S6]);
ok((await insertPost(S6, "free", "정지 해제", "x")).rows.length === 1, "unsuspended user can post again");
// 정지 전에 쓴 글을 정지 중에 고칠 수도 없다
const p6 = (await insertPost(S6, "free", "고칠 글", "x")).rows[0];
await q(A, "select public.set_user_suspended($1, true)", [S6]);
await expectError(q(S6, "update public.posts set title = '정지 중 수정' where id = $1", [p6.id]), "suspended user cannot edit", "정지");
ok((await q(S6, "update public.profiles set suspended = false where id = $1", [S6])).affectedRows === 0, "user cannot lift own suspension");

// --- 계정 삭제 시 정리 ---
await db.query("delete from auth.users where id = $1", [S2]);
ok((await db.query("select * from public.comments where author_id = $1", [S2])).rows.length === 0, "deleting an account removes its comments");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
