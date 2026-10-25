// 커뮤니티 DB 규칙 테스트: npm run test:community
// schema.sql 위에 community.sql을 얹은 가짜 Postgres(PGlite)에서,
// 학생·교사·관리자로 번갈아 로그인한 것처럼 RLS·트리거·함수가 제대로 막는지 확인한다.
// community.sql을 고치면 꼭 다시 돌려 볼 것.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const [schemaPath, ...communityPaths] = process.argv.slice(2);
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
for (const path of communityPaths) await db.exec(readFileSync(path, "utf8"));
console.log(`schema + ${communityPaths.length} community file(s) applied OK`);

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

// 도배 방지(community-v2.sql)가 일반 테스트를 막지 않도록, 기본적으로는 이전 기록의 시각을 하루 전으로 돌린다.
// 도배 방지 전용 구간에서만 backdate = false 로 실제 제한을 적용한다.
let backdate = true;
async function as(uid, fn) {
  await db.query("reset role");
  if (backdate) {
    await db.query("update public.posts set created_at = created_at - interval '1 day' where created_at > now() - interval '12 hours'");
    await db.query("update public.comments set created_at = created_at - interval '1 day' where created_at > now() - interval '12 hours'");
    await db.query("update public.reports set created_at = created_at - interval '1 day' where created_at > now() - interval '12 hours'");
  }
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
ok(p1.status === "published" && p1.author_name === "20301 학생1" && p1.author_role === "student", "student writes a question; real name (학번 이름)/role filled by server");
ok(!("student_no" in p1), "post has no separate student number column");
const spoof = (await q(S1, `insert into public.posts (author_id, kind, title, body, author_name, author_role, status, created_at)
  values ($1, 'free', '위조', '본문', '관리자', 'admin', 'review', '2000-01-01') returning *`, [S1])).rows[0];
ok(spoof.author_name === "20301 학생1" && spoof.author_role === "student" && spoof.status === "published" && spoof.created_at.getFullYear() > 2000,
  "spoofed name/role/status/time are overwritten");
const forged = (await q(S2, "insert into public.posts (author_id, kind, title, body) values ($1, 'free', 'a', 'b') returning author_id, author_name", [S1])).rows[0];
ok(forged.author_id === S2 && forged.author_name === "20302 학생2", "post forged as another user is stored under the real author");
await expectError(insertPost(S1, "notice", "가짜 공지", "x"), "student cannot write school notice", "관리자만");
await expectError(insertPost(T, "notice", "교사 공지", "x"), "teacher cannot write school notice", "관리자만");
ok((await insertPost(T, "free", "교사 자유글", "안녕")).rows.length === 1, "approved teacher writes a free post");
ok((await q(T, "select author_name from public.posts where author_id = $1", [T])).rows.every((r) => r.author_name === "김교사"), "teacher posts show the name only (no student number)");
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
ok(c1.author_name === "20302 학생2" && c1.status === "published", "comment author/status filled by server");
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


// =====================================================================
// community-v2: 알림
// =====================================================================
const N1 = await signup("n1@school.kr", { name: "알림글쓴이", role: "student", student_no: "20401", privacy_agreed: "true" });
const N2 = await signup("n2@school.kr", { name: "알림댓글러", role: "student", student_no: "20402", privacy_agreed: "true" });
const N3 = await signup("n3@school.kr", { name: "알림제3자", role: "student", student_no: "20403", privacy_agreed: "true" });
const nr = [];
for (let i = 0; i < 3; i++) nr.push(await signup(`nr${i}@school.kr`, { name: `알림신고${i}`, role: "student", student_no: `2041${i}`, privacy_agreed: "true" }));
const notes = (uid) => q(uid, "select * from public.notifications order by created_at, id").then((r) => r.rows);

const np = (await insertPost(N1, "question", "알림 테스트 질문 제목", "본문")).rows[0];
await q(N2, "insert into public.comments (post_id, author_id, body) values ($1, $2, '답변이에요') returning id", [np.id, N2]);
let n1 = await notes(N1);
ok(n1.length === 1 && n1[0].kind === "comment" && n1[0].actor_name === "20402 알림댓글러" && n1[0].excerpt === "알림 테스트 질문 제목" && n1[0].read_at === null,
  "post author is notified of a new comment (actor, excerpt, unread)");
await q(N1, "insert into public.comments (post_id, author_id, body) values ($1, $2, '내 글에 내가 단 댓글')", [np.id, N1]);
ok((await notes(N1)).length === 1, "own comment on own post sends no notification");
// (v4 이후) 글쓴이가 자기 글에 단 댓글은 먼저 댓글을 단 N2 에게 'reply' 로만 알린다. 관계없는 N3 에게는 아무것도 가지 않는다.
ok((await notes(N2)).map((n) => n.kind).join() === "reply" && (await notes(N3)).length === 0, "an earlier commenter gets only a 'reply'; unrelated users get nothing");
await expectError(q(N3, "insert into public.notifications (user_id, kind, post_id) values ($1, 'comment', $2)", [N3, np.id]), "users cannot create notifications");
await expectError(q(N1, "update public.notifications set read_at = null where user_id = $1", [N1]), "users cannot update notifications directly");
await expectError(q(N1, "delete from public.notifications where user_id = $1", [N1]), "users cannot delete notifications");
await q(N3, "select public.mark_notification_read($1)", [n1[0].id]);
ok((await notes(N1))[0].read_at === null, "another user cannot mark my notification read");
await q(N1, "select public.mark_notification_read($1)", [n1[0].id]);
ok((await notes(N1))[0].read_at !== null, "owner marks notification read");

// 신고 3회 -> 글쓴이에게 '숨김' 알림 -> 관리자 복구 -> '복구' 알림 -> 관리자 삭제 -> '삭제' 알림
for (const u of nr) await q(u, "select public.report_content($1, null, '사유')", [np.id]);
n1 = await notes(N1);
ok(n1.some((n) => n.kind === "hidden" && n.target_type === "post" && n.post_id === np.id), "author is notified when the post is auto-hidden");
await q(A, "select public.moderate_content($1, null, 'restore', '복구 사유')", [np.id]);
ok((await notes(N1)).some((n) => n.kind === "restored"), "author is notified on restore");
await q(A, "select public.moderate_content($1, null, 'delete', '삭제 사유')", [np.id]);
ok((await notes(N1)).some((n) => n.kind === "deleted" && n.excerpt === "알림 테스트 질문 제목"), "author is notified on admin delete (excerpt kept)");

// 내가 직접 지우면 알림 없음
const np2 = (await insertPost(N1, "free", "직접 지울 글", "x")).rows[0];
const before = (await notes(N1)).length;
await q(N1, "select public.delete_post($1)", [np2.id]);
ok((await notes(N1)).length === before, "deleting my own post sends no notification");

// 댓글 숨김 알림
const np3 = (await insertPost(N3, "free", "댓글 알림용 글", "x")).rows[0];
const nc3 = (await q(N2, "insert into public.comments (post_id, author_id, body) values ($1, $2, '숨겨질 댓글') returning id", [np3.id, N2])).rows[0];
await q(A, "select public.moderate_content(null, $1, 'hide', '확인 필요')", [nc3.id]);
const n2 = await notes(N2);
ok(n2.some((n) => n.kind === "hidden" && n.target_type === "comment" && n.comment_id === nc3.id && n.excerpt === "숨겨질 댓글"), "comment author is notified when the comment is hidden");
await q(N2, "select public.mark_all_notifications_read()");
ok((await notes(N2)).every((n) => n.read_at !== null), "mark all read");
ok((await notes(N3)).some((n) => n.kind === "comment") && (await notes(N3)).every((n) => n.read_at === null), "mark all read only affects my own");

// =====================================================================
// community-v2: 도배 방지 (이 구간부터 실제 제한 적용)
// =====================================================================
backdate = false;
const ago = (table, uid, interval) =>
  db.query(`update public.${table} set created_at = now() - interval '${interval}' where ${table === "reports" ? "reporter_id" : "author_id"} = $1`, [uid]);
const SP = await signup("sp@school.kr", { name: "도배학생", role: "student", student_no: "20501", privacy_agreed: "true" });

await insertPost(SP, "free", "도배 1", "내용 1");
await expectError(insertPost(SP, "free", "도배 바로 다음", "내용"), "second post within 10 seconds is blocked", "너무 빨리");
await ago("posts", SP, "1 minute");
await insertPost(SP, "free", "도배 2", "내용 2");
await ago("posts", SP, "1 minute");
await insertPost(SP, "free", "도배 3", "내용 3");
await ago("posts", SP, "1 minute");
await expectError(insertPost(SP, "free", "도배 4", "내용 4"), "4th post within 10 minutes is blocked", "10분에 3개");
await ago("posts", SP, "11 minutes");
ok((await insertPost(SP, "free", "도배 5", "내용 5")).rows.length === 1, "limit resets after the window");
await ago("posts", SP, "30 minutes"); // 10분 창 밖, 1시간 안
await expectError(insertPost(SP, "free", "도배 5", "내용 5"), "identical post within an hour is blocked", "같은 내용");
// 방금 쓴 글들이 서로 1분씩 간격으로 10분 창 안에 남도록, 기존 글 시각을 1분씩만 뒤로 민다.
for (const n of [7, 8, 9]) {
  await insertPost(SP, "free", `도배 ${n}`, `내용 ${n}`);
  await db.query("update public.posts set created_at = created_at - interval '1 minute' where author_id = $1", [SP]);
}
const wait = await insertPost(SP, "free", "도배 6", "내용 6").catch((e) => e);
ok(wait.message?.includes("분 뒤에"), `error tells how long to wait: ${wait.message?.split("\n")[0]}`);

// 삭제해도 횟수에 센다
const SP2 = await signup("sp2@school.kr", { name: "도배학생2", role: "student", student_no: "20502", privacy_agreed: "true" });
for (let i = 1; i <= 3; i++) {
  const row = (await insertPost(SP2, "free", `삭제도배 ${i}`, `x${i}`)).rows[0];
  await q(SP2, "select public.delete_post($1)", [row.id]);
  await ago("posts", SP2, "1 minute");
}
await expectError(insertPost(SP2, "free", "삭제도배 4", "x4"), "deleted posts still count toward the limit", "10분에 3개");

// 관리자는 글 제한 없음
for (let i = 1; i <= 5; i++) await q(A, "insert into public.posts (author_id, kind, title, body) values ($1, 'notice', $2, 'x')", [A, `공지 ${i}`]);
ok(true, "admin can post notices without the limit");

// 댓글
const CP = await signup("cp@school.kr", { name: "댓글글쓴이", role: "student", student_no: "20503", privacy_agreed: "true" });
const cpost = (await insertPost(CP, "free", "댓글 도배 글", "x")).rows[0];
for (let i = 1; i <= 8; i++) await q(SP, "insert into public.comments (post_id, author_id, body) values ($1, $2, $3)", [cpost.id, SP, `도배 댓글 ${i}`]);
await expectError(q(SP, "insert into public.comments (post_id, author_id, body) values ($1, $2, '9번째')", [cpost.id, SP]), "9th comment within 2 minutes is blocked", "2분에 8개");
await ago("comments", SP, "3 minutes");
await q(SP, "insert into public.comments (post_id, author_id, body) values ($1, $2, '같은 말')", [cpost.id, SP]);
await expectError(q(SP, "insert into public.comments (post_id, author_id, body) values ($1, $2, '같은 말')", [cpost.id, SP]), "identical comment within a minute is blocked", "같은 댓글");

// 신고: 1시간 10건
const RP = await signup("rp@school.kr", { name: "신고도배", role: "student", student_no: "20601", privacy_agreed: "true" });
const targets = [];
for (let i = 1; i <= 11; i++) {
  const owner = await signup(`own${i}@school.kr`, { name: `작성자${i}`, role: "student", student_no: `207${String(i).padStart(2, "0")}`, privacy_agreed: "true" });
  targets.push((await insertPost(owner, "free", `신고 대상 ${i}`, "x")).rows[0].id);
}
for (let i = 0; i < 10; i++) await q(RP, "select public.report_content($1, null, '사유')", [targets[i]]);
await expectError(q(RP, "select public.report_content($1, null, '사유')", [targets[10]]), "11th report within an hour is blocked", "10건");
await ago("reports", RP, "2 hours");
await q(RP, "select public.report_content($1, null, '사유')", [targets[10]]);
ok(true, "report limit resets after an hour");
backdate = true;


// =====================================================================
// community-v3: 답변 채택 / 댓글 수정 / 스크랩
// =====================================================================
const Q1 = await signup("q1@school.kr", { name: "질문자", role: "student", student_no: "20901", privacy_agreed: "true" });
const Q2 = await signup("q2@school.kr", { name: "답변자1", role: "student", student_no: "20902", privacy_agreed: "true" });
const Q3 = await signup("q3@school.kr", { name: "답변자2", role: "student", student_no: "20903", privacy_agreed: "true" });
const Q4 = await signup("q4@school.kr", { name: "구경꾼", role: "student", student_no: "20904", privacy_agreed: "true" });
const addComment = async (uid, postId, body) =>
  (await q(uid, "insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id", [postId, uid, body])).rows[0].id;
const accepted = async (postId) => (await q(A, "select accepted_comment_id from public.posts where id = $1", [postId])).rows[0].accepted_comment_id;

const qq = (await insertPost(Q1, "question", "채택 테스트 질문", "답 좀 알려주세요")).rows[0];
const ans1 = await addComment(Q2, qq.id, "첫 번째 답");
const ans2 = await addComment(Q3, qq.id, "두 번째 답");
const own = await addComment(Q1, qq.id, "질문자 본인 댓글");
ok((await accepted(qq.id)) === null, "a new question starts unsolved");

// 채택 권한
await expectError(q(Q2, "select public.accept_comment($1, $2)", [qq.id, ans2]), "only the question author can accept", "글쓴이만");
await expectError(q(Q4, "select public.accept_comment($1, $2)", [qq.id, ans1]), "a bystander cannot accept", "글쓴이만");
await expectError(q(Q1, "select public.accept_comment($1, $2)", [qq.id, own]), "cannot accept my own comment", "내 댓글");
const freePost = (await insertPost(Q1, "free", "자유글은 채택 없음", "x")).rows[0];
const freeC = await addComment(Q2, freePost.id, "자유글 댓글");
await expectError(q(Q1, "select public.accept_comment($1, $2)", [freePost.id, freeC]), "accepting only works on questions", "질문 글에서만");
const otherQ = (await insertPost(Q4, "question", "다른 질문", "x")).rows[0];
const otherC = await addComment(Q2, otherQ.id, "다른 글의 댓글");
await expectError(q(Q1, "select public.accept_comment($1, $2)", [qq.id, otherC]), "a comment from another post cannot be accepted", "채택할 수 없는 댓글");
await expectError(q(Q1, "update public.posts set accepted_comment_id = $1 where id = $2", [ans1, qq.id]), "accepted_comment_id cannot be set by direct UPDATE", "제목과 내용만");
await expectError(q(Q1, "update public.posts set accepted_comment_id = $1 where id = $2", [ans1, freePost.id]), "direct UPDATE of accepted_comment_id is blocked on any post", "제목과 내용만");

// 채택
await q(Q1, "select public.accept_comment($1, $2)", [qq.id, ans1]);
ok((await accepted(qq.id)) === ans1, "author accepts a comment -> question is solved");
ok((await q(Q4, "select accepted_comment_id from public.posts where id = $1", [qq.id])).rows[0].accepted_comment_id === ans1, "everyone sees the accepted answer");
let aNotes = (await notes(Q2)).filter((n) => n.kind === "accepted");
ok(aNotes.length === 1 && aNotes[0].target_type === "comment" && aNotes[0].comment_id === ans1 && aNotes[0].actor_name === "20901 질문자" && aNotes[0].excerpt === "채택 테스트 질문", "answer author is notified of the acceptance");
await q(Q1, "select public.accept_comment($1, $2)", [qq.id, ans1]);
ok((await notes(Q2)).filter((n) => n.kind === "accepted").length === 1, "re-accepting the sameStamp comment does not notify again");

// 바꾸기 / 취소
await q(Q1, "select public.accept_comment($1, $2)", [qq.id, ans2]);
ok((await accepted(qq.id)) === ans2, "author can switch the accepted answer");
ok((await notes(Q3)).filter((n) => n.kind === "accepted").length === 1, "the new answer author is notified");
await q(Q1, "select public.accept_comment($1, null)", [qq.id]);
ok((await accepted(qq.id)) === null, "author can cancel the acceptance");
await expectError(q(Q2, "select public.accept_comment($1, null)", [qq.id]), "others cannot cancel the acceptance", "글쓴이만");

// 채택된 댓글이 사라지면 채택도 풀린다
await q(Q1, "select public.accept_comment($1, $2)", [qq.id, ans1]);
await q(Q2, "select public.delete_comment($1)", [ans1]);
ok((await accepted(qq.id)) === null, "deleting the accepted comment clears the acceptance");
const ans3 = await addComment(Q3, qq.id, "세 번째 답");
await q(Q1, "select public.accept_comment($1, $2)", [qq.id, ans3]);
await q(A, "select public.moderate_content(null, $1, 'hide', '확인')", [ans3]);
ok((await accepted(qq.id)) === null, "hiding the accepted comment clears the acceptance");
await q(A, "select public.moderate_content(null, $1, 'restore', '문제 없음')", [ans3]);
ok((await accepted(qq.id)) === null, "restoring does not silently re-accept");
await expectError(q(Q1, "select public.accept_comment($1, $2)", [qq.id, ans1]), "a deleted comment cannot be accepted", "채택할 수 없는 댓글");

// 숨겨진 글에서는 채택할 수 없다 / 정지 계정
const sq = (await insertPost(Q4, "question", "정지 테스트 질문", "x")).rows[0];
const sc = await addComment(Q2, sq.id, "답");
await q(A, "select public.set_user_suspended($1, true)", [Q4]);
await expectError(q(Q4, "select public.accept_comment($1, $2)", [sq.id, sc]), "suspended author cannot accept", "채택할 수 없는 계정");
await q(A, "select public.set_user_suspended($1, false)", [Q4]);
await q(A, "select public.moderate_content($1, null, 'hide', '확인')", [sq.id]);
await expectError(q(Q4, "select public.accept_comment($1, $2)", [sq.id, sc]), "cannot accept on a hidden post", "게시 중인 글");

// 질문이 아닌 글은 채택 값을 가질 수 없다 (제약)
await expectError(db.query("update public.posts set accepted_comment_id = $1 where id = $2", [freeC, freePost.id]), "constraint: only questions can have an accepted comment");

// ---- 댓글 수정 ----
backdate = false; // 이 검사는 시각을 그대로 봐야 한다
const ec = await addComment(Q2, otherQ.id, "고치기 전 댓글");
const editBefore = (await q(Q2, "select created_at, updated_at from public.comments where id = $1", [ec])).rows[0];
ok(editBefore.updated_at.getTime() === editBefore.created_at.getTime(), "a new comment is not marked as edited");
backdate = true;
await q(Q2, "select public.update_comment($1, '  고친 댓글  ')", [ec]);
const editAfter = (await q(Q2, "select body, created_at, updated_at from public.comments where id = $1", [ec])).rows[0];
ok(editAfter.body === "고친 댓글" && editAfter.updated_at > editAfter.created_at, "author edits own comment (trimmed) and updated_at moves");
await expectError(q(Q3, "select public.update_comment($1, '남이 고침')", [ec]), "others cannot edit my comment", "수정할 수 없는 댓글");
await expectError(q(Q4, "select public.update_comment($1, '글쓴이도 못 고침')", [ec]), "even the post author cannot edit someone else's comment", "수정할 수 없는 댓글");
await expectError(q(A, "select public.update_comment($1, '관리자도 못 고침')", [ec]), "admin cannot rewrite others' comments either", "수정할 수 없는 댓글");
await expectError(q(Q2, "select public.update_comment($1, '   ')", [ec]), "blank edit rejected", "입력");
await expectError(q(Q2, "select public.update_comment($1, $2)", [ec, "가".repeat(1001)]), "edit over 1000 chars rejected", "1000자");
await expectError(q(Q2, "update public.comments set body = '직접 수정' where id = $1", [ec]), "direct UPDATE on comments is still blocked");
const sameStamp = (await q(Q2, "select updated_at from public.comments where id = $1", [ec])).rows[0].updated_at;
await q(Q2, "select public.update_comment($1, '고친 댓글')", [ec]);
ok((await q(Q2, "select updated_at from public.comments where id = $1", [ec])).rows[0].updated_at.getTime() === sameStamp.getTime(), "saving identical text is a no-op (not marked as edited again)");
// 채택된 댓글을 고쳐도 채택은 유지
await q(Q4, "select public.accept_comment($1, $2)", [otherQ.id, ec]);
await q(Q2, "select public.update_comment($1, '채택 후 보강한 댓글')", [ec]);
ok((await accepted(otherQ.id)) === ec, "editing an accepted answer keeps it accepted");
// 삭제/숨김/정지/숨겨진 글
await q(Q2, "select public.delete_comment($1)", [ec]);
await expectError(q(Q2, "select public.update_comment($1, '삭제 후 수정')", [ec]), "deleted comment cannot be edited", "수정할 수 없는 댓글");
const hc = await addComment(Q3, otherQ.id, "숨겨질 댓글");
await q(A, "select public.moderate_content(null, $1, 'hide', '확인')", [hc]);
await expectError(q(Q3, "select public.update_comment($1, '숨김 후 수정')", [hc]), "hidden comment cannot be edited", "수정할 수 없는 댓글");
const sc2 = await addComment(Q3, otherQ.id, "정지 전 댓글");
await q(A, "select public.set_user_suspended($1, true)", [Q3]);
await expectError(q(Q3, "select public.update_comment($1, '정지 중 수정')", [sc2]), "suspended user cannot edit", "정지된 계정");
await q(A, "select public.set_user_suspended($1, false)", [Q3]);
const pc = await addComment(Q3, otherQ.id, "글이 숨겨지면 수정 불가");
await q(A, "select public.moderate_content($1, null, 'hide', '확인')", [otherQ.id]);
await expectError(q(Q3, "select public.update_comment($1, '숨겨진 글의 댓글 수정')", [pc]), "cannot edit comments under a hidden post", "수정할 수 없는 댓글");
await q(A, "select public.moderate_content($1, null, 'restore', '문제 없음')", [otherQ.id]);

// ---- 스크랩 ----
const bp = (await insertPost(Q4, "free", "스크랩 대상 글", "x")).rows[0];
await q(Q2, "insert into public.bookmarks (post_id) values ($1)", [bp.id]);
ok((await q(Q2, "select * from public.bookmarks")).rows.length === 1, "user bookmarks a post (user_id defaults to me)");
ok((await q(Q2, "select user_id from public.bookmarks")).rows[0].user_id === Q2, "bookmark is stored under my id");
ok((await q(Q3, "select * from public.bookmarks")).rows.length === 0, "other users cannot see my bookmarks");
ok((await q(A, "select * from public.bookmarks")).rows.length === 0, "not even admins can see them");
await expectError(q(Q2, "insert into public.bookmarks (post_id) values ($1)", [bp.id]), "duplicate bookmark rejected");
await expectError(q(Q3, "insert into public.bookmarks (user_id, post_id) values ($1, $2)", [Q2, bp.id]), "cannot bookmark on someone else's behalf");
await expectError(q(Q2, "update public.bookmarks set created_at = now() where post_id = $1", [bp.id]), "bookmarks cannot be updated");
ok((await q(Q3, "delete from public.bookmarks where post_id = $1", [bp.id])).affectedRows === 0, "others cannot remove my bookmark");
// 숨겨진/삭제된 글은 스크랩할 수 없다
const hp = (await insertPost(Q4, "free", "숨겨질 글", "x")).rows[0];
await q(A, "select public.moderate_content($1, null, 'hide', '확인')", [hp.id]);
await expectError(q(Q3, "insert into public.bookmarks (post_id) values ($1)", [hp.id]), "cannot bookmark a hidden post");
// 스크랩 후 글이 숨겨지면 조회 때 걸러진다 (posts 의 RLS)
const joined = await q(Q2, "select b.post_id from public.bookmarks b join public.posts p on p.id = b.post_id");
ok(joined.rows.length === 1, "bookmarked visible post shows up through the join");
await q(A, "select public.moderate_content($1, null, 'hide', '확인')", [bp.id]);
ok((await q(Q2, "select b.post_id from public.bookmarks b join public.posts p on p.id = b.post_id")).rows.length === 0, "a bookmarked post that gets hidden disappears from the join");
await q(A, "select public.moderate_content($1, null, 'restore', '문제 없음')", [bp.id]);
ok((await q(Q2, "delete from public.bookmarks where post_id = $1", [bp.id])).affectedRows === 1, "owner removes the bookmark");
// 200개 상한
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [A]);
await db.query("insert into public.posts (author_id, kind, title, body) select $1, 'notice', '스크랩 상한용 ' || g, 'x' from generate_series(1, 201) g", [A]);
await db.query("insert into public.bookmarks (user_id, post_id) select $1, id from public.posts where title like '스크랩 상한용%' order by title limit 200", [Q3]);
ok((await db.query("select count(*)::int as n from public.bookmarks where user_id = $1", [Q3])).rows[0].n === 200, "200 bookmarks are allowed");
await expectError(q(Q3, "insert into public.bookmarks (post_id) select id from public.posts where title = '스크랩 상한용 99'"), "the 201st bookmark is rejected", "200개");
// 계정이 지워지면 스크랩도 사라진다
await db.query("delete from auth.users where id = $1", [Q3]);
ok((await db.query("select * from public.bookmarks where user_id = $1", [Q3])).rows.length === 0, "deleting an account removes its bookmarks");


// =====================================================================
// community-v4: 댓글 단 글의 새 댓글 알림 + 댓글 수/마지막 활동
// =====================================================================
const P1 = await signup("p1@school.kr", { name: "글쓴이", role: "student", student_no: "21001", privacy_agreed: "true" });
const P2 = await signup("p2@school.kr", { name: "참여자1", role: "student", student_no: "21002", privacy_agreed: "true" });
const P3 = await signup("p3@school.kr", { name: "참여자2", role: "student", student_no: "21003", privacy_agreed: "true" });
const P4 = await signup("p4@school.kr", { name: "참여자3", role: "student", student_no: "21004", privacy_agreed: "true" });
const P5 = await signup("p5@school.kr", { name: "구경꾼", role: "student", student_no: "21005", privacy_agreed: "true" });
const cm4 = async (uid, postId, body) =>
  (await q(uid, "insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id", [postId, uid, body])).rows[0].id;
const kindsOf = async (uid, postId) => (await notes(uid)).filter((n) => n.post_id === postId).map((n) => n.kind);
const stats = async (postId) => (await q(A, "select comment_count, last_activity_at, created_at from public.posts where id = $1", [postId])).rows[0];

const partPost = (await insertPost(P1, "question", "참여 알림 테스트", "본문")).rows[0];
ok((await stats(partPost.id)).comment_count === 0, "new post starts with 0 comments");

// 1) 첫 댓글: 글쓴이만 알림 (참여자 아직 없음)
await cm4(P2, partPost.id, "참여자1의 댓글");
ok((await kindsOf(P1, partPost.id)).join() === "comment", "author gets 'comment' for the first comment");
ok((await kindsOf(P2, partPost.id)).length === 0, "the commenter is not notified of their own comment");

// 2) 두 번째 사람이 댓글: 글쓴이='comment', 이전 참여자=reply
const tC2 = await cm4(P3, partPost.id, "참여자2의 댓글");
ok((await kindsOf(P1, partPost.id)).join() === "comment,comment", "author gets another 'comment'");
const p2n = (await notes(P2)).filter((n) => n.post_id === partPost.id);
ok(p2n.length === 1 && p2n[0].kind === "reply" && p2n[0].actor_name === "21003 참여자2" && p2n[0].excerpt === "참여자 알림 테스트".replace("참여자 알림", "참여 알림") && p2n[0].comment_id === tC2, "earlier commenter gets a 'reply' notification (actor + title)");
ok((await kindsOf(P3, partPost.id)).length === 0, "the new commenter is not notified");
ok((await kindsOf(P5, partPost.id)).length === 0, "people who never commented are not notified");
ok(!(await kindsOf(P1, partPost.id)).includes("reply"), "the post author never gets a 'reply' (only 'comment')");

// 3) 안 읽은 reply 가 있으면 쌓지 않는다
await cm4(P4, partPost.id, "참여자3의 댓글");
ok((await kindsOf(P2, partPost.id)).filter((k) => k === "reply").length === 1, "no second 'reply' while the first is unread (P2)");
ok((await kindsOf(P3, partPost.id)).filter((k) => k === "reply").length === 1, "P3 gets one 'reply' for the later comment");
// 읽으면 다음 댓글에서 다시 알린다
await q(P2, "select public.mark_all_notifications_read()");
await cm4(P4, partPost.id, "참여자3의 두 번째 댓글");
ok((await kindsOf(P2, partPost.id)).filter((k) => k === "reply").length === 2, "after reading, a new comment notifies again");
ok((await kindsOf(P4, partPost.id)).length === 0, "the latest commenter still gets nothing");

// 4) 지워진/숨겨진 댓글만 남은 사람에게는 알리지 않는다
await q(P3, "select public.delete_comment($1)", [tC2]);
const before3 = (await kindsOf(P3, partPost.id)).length;
await cm4(P4, partPost.id, "참여자3의 세 번째 댓글");
ok((await kindsOf(P3, partPost.id)).length === before3, "someone whose only comment was deleted is not notified");
const hidC = await cm4(P5, partPost.id, "숨겨질 댓글");
await q(A, "select public.moderate_content(null, $1, 'hide', '확인')", [hidC]);
const before5 = (await kindsOf(P5, partPost.id)).length;
await cm4(P4, partPost.id, "참여자3의 네 번째 댓글");
ok((await kindsOf(P5, partPost.id)).length === before5, "someone whose only comment is hidden is not notified");

// 5) 같은 사람이 여러 번 댓글을 달아도 한 번만
const multiPost = (await insertPost(P1, "free", "중복 참여자 테스트", "본문")).rows[0];
await cm4(P2, multiPost.id, "하나");
await cm4(P2, multiPost.id, "둘");
await cm4(P2, multiPost.id, "셋");
await cm4(P3, multiPost.id, "다른 사람");
ok((await kindsOf(P2, multiPost.id)).filter((k) => k === "reply").length === 1, "a multi-comment participant gets a single 'reply' per trigger");

// 6) 글쓴이가 자기 글에 댓글: 참여자에게 reply, 본인은 없음
const before1 = (await kindsOf(P1, multiPost.id)).length;
await q(P2, "select public.mark_all_notifications_read()");
await cm4(P1, multiPost.id, "글쓴이의 답글");
ok((await kindsOf(P2, multiPost.id)).filter((k) => k === "reply").length === 2, "author's own reply notifies earlier commenters");
ok((await kindsOf(P1, multiPost.id)).length === before1, "author is not notified of their own comment");

// 7) 알림은 여전히 직접 만들 수 없다
await expectError(q(P2, "insert into public.notifications (user_id, kind, post_id) values ($1, 'reply', $2)", [P2, multiPost.id]), "'reply' notifications cannot be created by users");

// ---- 댓글 수 / 마지막 활동 ----
const statPost = (await insertPost(P1, "free", "댓글 수 테스트", "본문")).rows[0];
let stat0 = await stats(statPost.id);
ok(stat0.comment_count === 0, "comment_count starts at 0");
const stC1 = await cm4(P2, statPost.id, "하나");
const stC2 = await cm4(P3, statPost.id, "둘");
let stat2 = await stats(statPost.id);
ok(stat2.comment_count === 2, "comment_count follows new comments");
ok(stat2.last_activity_at >= stat0.last_activity_at, "last_activity_at moves forward with a comment");
await q(P3, "select public.delete_comment($1)", [stC2]);
ok((await stats(statPost.id)).comment_count === 1, "deleting a comment lowers the count");
await q(A, "select public.moderate_content(null, $1, 'hide', '확인')", [stC1]);
ok((await stats(statPost.id)).comment_count === 0, "hiding a comment lowers the count");
await q(A, "select public.moderate_content(null, $1, 'restore', '문제 없음')", [stC1]);
ok((await stats(statPost.id)).comment_count === 1, "restoring a comment raises the count");
// 사용자는 이 값을 직접 바꿀 수 없다
await expectError(q(P1, "update public.posts set comment_count = 999 where id = $1", [statPost.id]), "comment_count cannot be set directly", "제목과 내용만");
await expectError(q(P1, "update public.posts set last_activity_at = now() + interval '1 year' where id = $1", [statPost.id]), "last_activity_at cannot be set directly", "제목과 내용만");
// 글 수정은 활동 시각을 건드리지 않는다
const actAt = (await stats(statPost.id)).last_activity_at;
await q(P1, "update public.posts set body = '본문 수정' where id = $1", [statPost.id]);
ok((await stats(statPost.id)).last_activity_at.getTime() === actAt.getTime(), "editing the post does not change last_activity_at");
// 정렬이 되는지
const sortedRows = (await q(P5, "select id, comment_count from public.posts where id in ($1, $2) order by comment_count desc, created_at desc", [statPost.id, partPost.id])).rows;
ok(sortedRows[0].id === partPost.id && sortedRows[0].comment_count > sortedRows[1].comment_count, "ordering by comment_count puts the busier post first");
// 계정 삭제로 댓글이 사라지면 숫자도 맞춰진다
const dropPost = (await insertPost(P1, "free", "계정 삭제 카운트", "본문")).rows[0];
const loneUser = await signup("p6@school.kr", { name: "곧 탈퇴", role: "student", student_no: "21006", privacy_agreed: "true" });
await cm4(loneUser, dropPost.id, "곧 사라질 댓글");
ok((await stats(dropPost.id)).comment_count === 1, "count includes the comment");
await db.query("delete from auth.users where id = $1", [loneUser]);
ok((await stats(dropPost.id)).comment_count === 0, "deleting an account re-counts the post");

// --- v5: 학생은 항상 "학번 이름" 실명 ---
const realPost = (await insertPost(S3, "free", "실명 확인", "본문")).rows[0];
ok(realPost.author_name === "20303 학생3", "new student post shows 학번 + 이름");
await expectError(q(S3, "update public.posts set author_name = '익명' where id = $1", [realPost.id]), "student cannot rename themselves on a post", "제목과 내용만");
// v5 이전에 쓴 글(이름만 저장)이 파일을 다시 실행하면 실명으로 맞춰지고, 두 번 실행해도 같다
await db.query("update public.posts set author_name = '학생3' where id = $1", [realPost.id]);
await db.exec(readFileSync("supabase/community-v5.sql", "utf8"));
await db.exec(readFileSync("supabase/community-v5.sql", "utf8"));
ok((await db.query("select author_name from public.posts where id = $1", [realPost.id])).rows[0].author_name === "20303 학생3", "re-running v5 backfills old student posts (idempotent)");
ok((await db.query("select count(*)::int as n from public.posts where author_role = 'teacher' and author_name like '% %'")).rows[0].n === 0, "backfill leaves teacher names alone");

// --- v6: 읽은 글 ---
const readPost = (await insertPost(S4, "free", "읽음 확인", "본문")).rows[0];
await q(S5, "insert into public.post_reads (post_id) values ($1)", [readPost.id]);
await q(S5, "insert into public.post_reads (post_id) values ($1) on conflict do nothing", [readPost.id]);
ok((await q(S5, "select user_id from public.post_reads where post_id = $1", [readPost.id])).rows.length === 1 &&
   (await q(S5, "select user_id from public.post_reads where post_id = $1", [readPost.id])).rows[0].user_id === S5, "reading a post records one row for me (repeat is ignored)");
ok((await q(S6, "select * from public.post_reads")).rows.length === 0, "others cannot see what I read");
ok((await q(A, "select * from public.post_reads")).rows.length === 0, "admin cannot see read records either");
await expectError(q(S6, "insert into public.post_reads (user_id, post_id) values ($1, $2)", [S5, readPost.id]), "cannot record a read for someone else", "row-level security");
const embedded = (await q(S5, "select p.id, (select count(*)::int from public.post_reads r where r.post_id = p.id) as reads from public.posts p where p.id = $1", [readPost.id])).rows[0];
ok(embedded.reads === 1, "list can join my reads (RLS keeps only mine)");
await db.query("update public.posts set status = 'review' where id = $1", [readPost.id]);
await expectError(q(S6, "insert into public.post_reads (post_id) values ($1)", [readPost.id]), "cannot record a read on a hidden post", "row-level security");
await db.exec(readFileSync("supabase/community-v6.sql", "utf8"));
ok(true, "community-v6.sql can be re-run");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
