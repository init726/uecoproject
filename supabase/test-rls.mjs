// DB 보안 규칙 테스트: npm run test:db
// 내 컴퓨터 안에서 가짜 Postgres(PGlite)에 schema.sql을 실행하고,
// 학생·교사·관리자로 번갈아 로그인한 것처럼 RLS와 트리거가 제대로 막는지 확인한다.
// schema.sql을 고치면 꼭 다시 돌려 볼 것.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const schemaPath = process.argv[2];
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
console.log("schema applied OK");

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
async function expectError(promise, msg) {
  try {
    await promise;
    ok(false, `${msg} (expected error, got success)`);
  } catch (e) {
    ok(true, `${msg} -> ${e.message.split("\n")[0]}`);
  }
}
async function signup(email, meta) {
  const r = await db.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify(meta)],
  );
  return r.rows[0].id;
}

// --- signup ---
const T = await signup("t@school.kr", { name: "김교사", role: "teacher", subject: "수학", privacy_agreed: "true" });
const S1 = await signup("s1@school.kr", { name: "이학생", role: "student", student_no: "20301", privacy_agreed: "true" });
const S2 = await signup("s2@school.kr", { name: "박학생", role: "student", student_no: "20302", privacy_agreed: "true" });
const A = await signup("a@school.kr", { name: "관리자", role: "student", privacy_agreed: "true" });
await db.query("update public.profiles set role = 'admin', approved = true where id = $1", [A]);
const H = await signup("h@school.kr", { name: "해커", role: "admin", privacy_agreed: "true" });
const hacker = (await db.query("select role, approved from public.profiles where id = $1", [H])).rows[0];
ok(hacker.role === "student", "signup with role=admin becomes student");
await expectError(signup("n@school.kr", { name: "동의안함", role: "student" }), "signup without privacy consent fails");
const teacherRow = (await db.query("select approved from public.profiles where id = $1", [T])).rows[0];
ok(teacherRow.approved === false, "new teacher starts unapproved");

// --- teacher approval ---
await expectError(
  as(T, () => db.query("insert into public.classes (teacher_id, name, semester) values ($1, '수학Ⅱ', '2026-2')", [T])),
  "unapproved teacher cannot create class",
);
await expectError(as(S1, () => db.query("select public.set_teacher_approval($1, true)", [T])), "student cannot approve teacher");
await as(A, () => db.query("select public.set_teacher_approval($1, true)", [T]));
ok((await db.query("select approved from public.profiles where id = $1", [T])).rows[0].approved, "admin approves teacher");
await expectError(
  as(S1, () => db.query("insert into public.classes (teacher_id, name, semester) values ($1, '가짜', '2026-2')", [S1])),
  "student cannot create class",
);

// --- classes ---
const c1 = await as(T, async () => {
  const r = await db.query(
    "insert into public.classes (teacher_id, name, semester, room) values ($1, '수학Ⅱ', '2026-2', '2-3') returning id, invite_code",
    [T],
  );
  await db.query("insert into public.class_slots (class_id, day, period) values ($1, 1, 3), ($1, 3, 2)", [r.rows[0].id]);
  return r.rows[0];
});
ok(/^[A-HJ-NP-Z2-9]{6}$/.test(c1.invite_code), `invite code format ${c1.invite_code}`);
const c2 = await as(T, async () => {
  const r = await db.query(
    "insert into public.classes (teacher_id, name, semester) values ($1, '확률과 통계', '2026-2') returning id, invite_code",
    [T],
  );
  await db.query("insert into public.class_slots (class_id, day, period) values ($1, 1, 3)", [r.rows[0].id]);
  return r.rows[0];
});

// --- join ---
ok((await as(S1, () => db.query("select * from public.classes"))).rows.length === 0, "student sees no class before joining");
const j1 = (await as(S1, () => db.query("select public.join_class($1) as r", [` ${c1.invite_code.toLowerCase()} `]))).rows[0].r;
ok(j1.class_id === c1.id && j1.conflicts.length === 0, "join with lowercase/spaced code, no conflicts");
const j2 = (await as(S1, () => db.query("select public.join_class($1) as r", [c2.invite_code]))).rows[0].r;
ok(j2.conflicts.length === 1 && j2.conflicts[0].includes("월 3교시"), `overlap warning: ${JSON.stringify(j2.conflicts)}`);
await expectError(as(S1, () => db.query("select public.join_class('ZZZZZZ')")), "wrong code fails");
await expectError(as(T, () => db.query("select public.join_class($1)", [c1.invite_code])), "teacher cannot join as student");
await expectError(
  as(S2, () => db.query("insert into public.enrollments (class_id, student_id) values ($1, $2)", [c1.id, S2])),
  "direct enrollment insert is blocked",
);
ok((await as(S1, () => db.query("select * from public.classes"))).rows.length === 2, "student sees joined classes");
ok((await as(S2, () => db.query("select * from public.classes"))).rows.length === 0, "other student sees none");
ok((await as(S1, () => db.query("select * from public.class_slots"))).rows.length === 3, "student sees slots of joined classes");

// --- profiles visibility ---
const s1Profiles = (await as(S1, () => db.query("select name from public.profiles order by name"))).rows.map((r) => r.name);
ok(s1Profiles.length === 2 && s1Profiles.includes("김교사") && s1Profiles.includes("이학생"), `student sees self + teacher: ${s1Profiles}`);
const tProfiles = (await as(T, () => db.query("select name from public.profiles"))).rows.map((r) => r.name);
ok(tProfiles.length === 2 && tProfiles.includes("이학생"), `teacher sees self + enrolled student: ${tProfiles}`);
ok((await as(A, () => db.query("select * from public.profiles"))).rows.length === 5, "admin sees all 5 profiles");
const upd = await as(S1, () => db.query("update public.profiles set role = 'admin' where id = $1", [S1]));
ok(upd.affectedRows === 0, "student cannot change own role");

// --- assignments & submissions ---
const textA = (await as(T, () => db.query(
  "insert into public.assignments (class_id, title, due_at, type, max_chars) values ($1, '진로 탐색 글', now() + interval '1 day', 'text', 100) returning id",
  [c1.id],
))).rows[0].id;
const fileA = (await as(T, () => db.query(
  "insert into public.assignments (class_id, title, due_at, type) values ($1, '수행평가 보고서', now() + interval '1 day', 'file') returning id",
  [c1.id],
))).rows[0].id;
const lateA = (await as(T, () => db.query(
  "insert into public.assignments (class_id, title, due_at, type, max_chars, allow_late) values ($1, '마감 지난 과제', now() - interval '1 hour', 'text', 100, false) returning id",
  [c1.id],
))).rows[0].id;
const lateOkA = (await as(T, () => db.query(
  "insert into public.assignments (class_id, title, due_at, type, max_chars) values ($1, '지각 허용 과제', now() - interval '1 hour', 'text', 100) returning id",
  [c1.id],
))).rows[0].id;
await expectError(
  as(S1, () => db.query("insert into public.assignments (class_id, title, due_at, type) values ($1, 'x', now(), 'file')", [c1.id])),
  "student cannot create assignment",
);

const sub1 = (await as(S1, () => db.query(
  "insert into public.submissions (assignment_id, student_id, content, submitted_at, is_late, version) values ($1, $2, '나의 진로는 수학 교사', '2000-01-01', true, 99) returning version, submitted_at, is_late",
  [textA, S1],
))).rows[0];
ok(sub1.version === 1 && sub1.is_late === false && new Date(sub1.submitted_at).getFullYear() > 2000, "server overrides spoofed version/time/late");
const sub2 = (await as(S1, () => db.query(
  "insert into public.submissions (assignment_id, student_id, content) values ($1, $2, '수정본') returning version",
  [textA, S1],
))).rows[0];
ok(sub2.version === 2, "resubmission increments version");
await expectError(
  as(S1, () => db.query("insert into public.submissions (assignment_id, student_id, content) values ($1, $2, $3)", [textA, S1, "가".repeat(101)])),
  "over max_chars rejected",
);
await expectError(
  as(S1, () => db.query("insert into public.submissions (assignment_id, student_id, content) values ($1, $2, 'x')", [lateA, S1])),
  "late submission rejected when allow_late=false",
);
const late = (await as(S1, () => db.query(
  "insert into public.submissions (assignment_id, student_id, content) values ($1, $2, '늦었어요') returning is_late",
  [lateOkA, S1],
))).rows[0];
ok(late.is_late === true, "late submission marked is_late");
await expectError(
  as(S2, () => db.query("insert into public.submissions (assignment_id, student_id, content) values ($1, $2, 'x')", [textA, S2])),
  "non-member cannot submit",
);
const tamper = await as(S1, () => db.query("update public.submissions set content = '조작' where student_id = $1", [S1]));
ok(tamper.affectedRows === 0, "student cannot edit a submission");
const del = await as(S1, () => db.query("delete from public.submissions where student_id = $1", [S1]));
ok(del.affectedRows === 0, "student cannot delete a submission");

// --- files ---
const goodPath = `${fileA}/${S1}/1700000000000.pdf`;
await as(S1, () => db.query(
  "insert into storage.objects (bucket_id, name, metadata) values ('submissions', $1, '{\"size\": 12345}')",
  [goodPath],
));
ok(true, "student uploads to own folder");
await expectError(
  as(S1, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('submissions', $1, '{}')", [`${fileA}/${S2}/x.pdf`])),
  "upload into another student's folder blocked",
);
await expectError(
  as(S1, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('submissions', $1, '{}')", [`${fileA}/${S1}/x.exe`])),
  "disallowed extension blocked",
);
await expectError(
  as(S2, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('submissions', $1, '{}')", [`${fileA}/${S2}/x.pdf`])),
  "non-member upload blocked",
);
await expectError(
  as(S1, () => db.query("insert into public.submissions (assignment_id, student_id, file_path, file_name) values ($1, $2, $3, 'a.pdf')", [fileA, S1, `${fileA}/${S1}/missing.pdf`])),
  "submission pointing to missing file rejected",
);
await expectError(
  as(S1, () => db.query("insert into public.submissions (assignment_id, student_id, content) values ($1, $2, 'text on file task')", [fileA, S1])),
  "text on file assignment rejected",
);
const fsub = (await as(S1, () => db.query(
  "insert into public.submissions (assignment_id, student_id, file_path, file_name, file_size) values ($1, $2, $3, '보고서.pdf', 1) returning file_size",
  [fileA, S1, goodPath],
))).rows[0];
ok(Number(fsub.file_size) === 12345, "file_size taken from storage, not client");

// --- who sees submissions ---
ok((await as(T, () => db.query("select * from public.submissions"))).rows.length === 4, "teacher sees class submissions");
ok((await as(S2, () => db.query("select * from public.submissions"))).rows.length === 0, "other student sees no submissions");
ok((await as(A, () => db.query("select * from public.submissions"))).rows.length === 0, "admin sees no submissions");
ok((await as(T, () => db.query("select * from storage.objects"))).rows.length === 1, "teacher can read file");
ok((await as(S2, () => db.query("select * from storage.objects"))).rows.length === 0, "other student cannot read file");

// --- leave / kick ---
const kick = await as(T, () => db.query("delete from public.enrollments where class_id = $1 and student_id = $2", [c2.id, S1]));
ok(kick.affectedRows === 1, "teacher removes student from class");
const s2kick = await as(S2, () => db.query("delete from public.enrollments where class_id = $1", [c1.id]));
ok(s2kick.affectedRows === 0, "other student cannot remove enrollments");

// --- reject teacher ---
const T2 = await signup("t2@school.kr", { name: "가짜교사", role: "teacher", privacy_agreed: "true" });
await as(A, () => db.query("select public.set_teacher_approval($1, false)", [T2]));
ok((await db.query("select * from auth.users where id = $1", [T2])).rows.length === 0, "rejected teacher account deleted");
await as(A, () => db.query("select public.set_teacher_approval($1, false)", [S2]));
ok((await db.query("select * from auth.users where id = $1", [S2])).rows.length === 1, "reject cannot delete a student");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
