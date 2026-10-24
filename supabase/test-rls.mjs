// DB 보안 규칙 테스트: npm run test:db
// 내 컴퓨터 안에서 가짜 Postgres(PGlite)에 schema.sql을 실행하고,
// 학생·교사·관리자로 번갈아 로그인한 것처럼 RLS와 트리거가 제대로 막는지 확인한다.
// schema.sql을 고치면 꼭 다시 돌려 볼 것.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const schemaPath = process.argv[2];
const db = new PGlite();

const { dbStub: stub } = await import("./test-support.mjs");

await db.exec(stub);
await db.exec(readFileSync(schemaPath, "utf8"));
await db.query("insert into public.semesters(id,academic_year,term) values ('2026-1학기',2026,1),('2026-2학기',2026,2) on conflict do nothing");
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
  as(T, () => db.query("insert into public.classes (teacher_id, name, semester) values ($1, '수학Ⅱ', '2026-2학기')", [T])),
  "unapproved teacher cannot create class",
);
await expectError(as(S1, () => db.query("select public.set_teacher_approval($1, true)", [T])), "student cannot approve teacher");
await as(A, () => db.query("select public.set_teacher_approval($1, true)", [T]));
ok((await db.query("select approved from public.profiles where id = $1", [T])).rows[0].approved, "admin approves teacher");
await expectError(
  as(S1, () => db.query("insert into public.classes (teacher_id, name, semester) values ($1, '가짜', '2026-2학기')", [S1])),
  "student cannot create class",
);

// --- classes ---
const c1 = await as(T, async () => {
  const r = await db.query(
    "insert into public.classes (teacher_id, name, semester, room) values ($1, '수학Ⅱ', '2026-2학기', '2-3') returning id, invite_code",
    [T],
  );
  await db.query("insert into public.class_slots (class_id, day, period) values ($1, 1, 3), ($1, 3, 2)", [r.rows[0].id]);
  return r.rows[0];
});
ok(/^[A-HJ-NP-Z2-9]{6}$/.test(c1.invite_code), `invite code format ${c1.invite_code}`);
const c2 = await as(T, async () => {
  const r = await db.query(
    "insert into public.classes (teacher_id, name, semester) values ($1, '확률과 통계', '2026-2학기') returning id, invite_code",
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

// --- semester-aware atomic class edits ---
const slots = JSON.stringify([{ day: 2, period: 5 }, { day: 4, period: 1 }]);
async function saveClass(uid, name, semester, selectedSlots, classId = null, allowConflicts = false) {
  return (await as(uid, () => db.query(
    "select public.save_class($1, $2, $3, $4::jsonb, $5, $6) as result",
    [name, semester, "본관 201", selectedSlots, classId, allowConflicts],
  ))).rows[0].result;
}
await expectError(saveClass(S1, "가짜", "2026-2학기", slots), "student cannot call class-save RPC");
const T3 = await signup("t3@school.kr", { name: "미승인", role: "teacher", privacy_agreed: "true" });
await expectError(saveClass(T3, "가짜", "2026-2학기", slots), "unapproved teacher cannot call class-save RPC");
const created = await saveClass(T, "새 과목", "2026-2학기", slots);
ok(Boolean(created.class_id) && created.conflicts.length === 0, "RPC creates class with selected semester");
ok((await db.query("select * from public.class_slots where class_id=$1", [created.class_id])).rows.length === 2, "class and slots saved together");
const beforeCount = (await db.query("select count(*)::int as n from public.classes")).rows[0].n;
const warning = await saveClass(T, "겹친 과목", "2026-2학기", slots);
ok(warning.class_id === null && warning.conflicts.length === 2, "teacher receives overlap warning before write");
ok((await db.query("select count(*)::int as n from public.classes")).rows[0].n === beforeCount, "overlap warning creates no partial class");
const confirmed = await saveClass(T, "겹친 과목", "2026-2학기", slots, null, true);
ok(Boolean(confirmed.class_id), "teacher can explicitly confirm overlap");
const otherSemester = await saveClass(T, "다른 학기", "2026-1학기", slots);
ok(Boolean(otherSemester.class_id) && otherSemester.conflicts.length === 0, "different semesters do not conflict");
await expectError(saveClass(T, "실패", "없는 학기", slots, created.class_id), "unknown semester rejected");
await expectError(saveClass(T, "실패", "2026-2학기", '[{"day":6,"period":1}]', created.class_id), "invalid slot rejected");
await expectError(saveClass(T, "실패", "2026-2학기", '[]', created.class_id), "empty timetable rejected");
ok((await db.query("select name from public.classes where id=$1", [created.class_id])).rows[0].name === "새 과목", "failed edit preserves previous class");
ok((await db.query("select * from public.class_slots where class_id=$1", [created.class_id])).rows.length === 2, "failed edit preserves previous timetable");
const T4 = await signup("t4@school.kr", { name: "다른교사", role: "teacher", privacy_agreed: "true" });
await as(A, () => db.query("select public.set_teacher_approval($1, true)", [T4]));
await expectError(saveClass(T4, "탈취", "2026-2학기", slots, created.class_id), "another teacher cannot edit class");
const conflictingEdit = await saveClass(T, "이름변경", "2026-2학기", slots, created.class_id);
ok(conflictingEdit.class_id === null, "edit also requires overlap confirmation");
await saveClass(T, "수정 과목", "2026-1학기", '[{"day":5,"period":7}]', created.class_id);
const edited = (await db.query("select * from public.classes where id=$1", [created.class_id])).rows[0];
ok(edited.name === "수정 과목" && edited.semester === "2026-1학기" && edited.room === "본관 201", "teacher edits name, semester and room");
const editedSlots = (await db.query("select day, period from public.class_slots where class_id=$1", [created.class_id])).rows;
ok(editedSlots.length === 1 && editedSlots[0].day === 5 && editedSlots[0].period === 7, "edit replaces rather than appends slots");
const ownEdit = await saveClass(T, "수정 과목", "2026-1학기", '[{"day":5,"period":7}]', created.class_id);
ok(ownEdit.conflicts.length === 0, "editing excludes own slots from conflicts");
await db.exec(`create function public.reject_test_slot() returns trigger language plpgsql as $$ begin
  if new.period = 6 then raise exception 'test storage failure'; end if; return new; end $$;
  create trigger test_slot_failure before insert on public.class_slots for each row execute function public.reject_test_slot();`);
await expectError(saveClass(T, "롤백 확인", "2026-2학기", '[{"day":5,"period":6}]', created.class_id), "slot insertion failure aborts entire edit");
ok((await db.query("select name from public.classes where id=$1", [created.class_id])).rows[0].name === "수정 과목", "class update rolled back after slot insertion failure");
ok((await db.query("select period from public.class_slots where class_id=$1", [created.class_id])).rows[0]?.period === 7, "deleted slots restored after insertion failure");
await db.exec("drop trigger test_slot_failure on public.class_slots; drop function public.reject_test_slot();");
const crossTerm = await saveClass(T, "다음 학기 수학", "2026-1학기", '[{"day":1,"period":3}]');
const crossCode = (await db.query("select invite_code from public.classes where id=$1", [crossTerm.class_id])).rows[0].invite_code;
const crossJoin = (await as(S1, () => db.query("select public.join_class($1) as r", [crossCode]))).rows[0].r;
ok(crossJoin.conflicts.length === 0, "student join ignores overlaps in another semester");
ok((await as(S1, () => db.query("select name from public.classes where semester='2026-1학기'"))).rows.length === 1, "semester filter only returns enrolled classes in selected semester");
await expectError(as(S1, () => db.query("insert into public.semesters(id) values ('가짜 학기')")), "student cannot create semesters");
await expectError(as(null, () => db.query("select * from public.semesters")), "anonymous cannot read semester catalog");

// 기존 자유 입력 학기를 사용하는 설치에도 migration이 자료 손실 없이 적용되는지 확인.
const legacyDb = new PGlite();
await legacyDb.exec(stub);
await legacyDb.exec(readFileSync(schemaPath, "utf8").split("-- 기존 프로젝트: SQL Editor")[0]);
const legacyTeacher = (await legacyDb.query("insert into auth.users(email, raw_user_meta_data) values ('legacy@school.kr', '{\"name\":\"기존교사\",\"role\":\"teacher\",\"privacy_agreed\":\"true\"}') returning id")).rows[0].id;
await legacyDb.query("insert into public.classes(teacher_id,name,semester) values ($1,'기존 과목','2026년 2학기')", [legacyTeacher]);
await legacyDb.query("insert into public.classes(teacher_id,name,semester) values ($1,'특별 과목','겨울 특별학기')", [legacyTeacher]);
await legacyDb.exec(readFileSync(new URL('./migrations/20261024_semester_timetable.sql', import.meta.url), 'utf8'));
ok((await legacyDb.query("select c.name from public.classes c join public.semesters s on s.id=c.semester where s.id='2026-2학기'")).rows.length === 1, "migration normalizes recognized legacy semesters without losing classes");
ok((await legacyDb.query("select c.name from public.classes c join public.semesters s on s.id=c.semester where s.id='겨울 특별학기'")).rows.length === 1, "migration preserves custom legacy semester names");
await legacyDb.exec(readFileSync(new URL('./update-school-import.sql', import.meta.url), 'utf8'));
await legacyDb.exec(readFileSync(new URL('./update-school-import.sql', import.meta.url), 'utf8'));
ok((await legacyDb.query("select name,import_key from public.classes")).rows.length===2,"combined update is repeatable and preserves existing classes");
await legacyDb.close();

// --- administrator workbook import ---
const importClasses = [
  {name:"엑셀 문학",teacher_id:T,room:"별관 201",slots:[{day:2,period:6}],capacity:25},
  {name:"엑셀 영어",teacher_id:T4,room:"별관 202",slots:[{day:4,period:6}],capacity:25},
];
const importEnrollments = [S1,S2].flatMap(student_id=>importClasses.map(c=>({student_id,class_name:c.name})));
async function importTimetable(uid, classes=importClasses, enrollments=importEnrollments) {
  return (await as(uid,()=>db.query("select public.import_school_timetable('2026-2학기',$1::jsonb,$2::jsonb) as r",[JSON.stringify(classes),JSON.stringify(enrollments)]))).rows[0].r;
}
await expectError(importTimetable(S1),"student cannot import school timetable");
await expectError(importTimetable(T),"teacher cannot import school timetable");
await expectError(importTimetable(null),"anonymous cannot import school timetable");
const imported=await importTimetable(A);
ok(imported.classes_created===2 && imported.enrollments_added===4,"admin atomically imports classes, slots and enrollments");
const repeated=await importTimetable(A);
ok(repeated.classes_created===0 && repeated.classes_reused===2 && repeated.enrollments_added===0,"reimport reuses classes and enrollments without duplicates");
ok((await as(S1,()=>db.query("select name from public.classes where name like '엑셀 %'"))).rows.length===2,"student sees imported personal classes");
ok((await as(T,()=>db.query("select name from public.classes where name like '엑셀 %'"))).rows.length===1,"teacher only sees assigned imported class");
ok((await as(H,()=>db.query("select name from public.classes where name like '엑셀 %'"))).rows.length===0,"unassigned student cannot view imported classes");
const importedId=(await db.query("select id from public.classes where name='엑셀 문학'")).rows[0].id;
await expectError(as(T,()=>db.query("update public.classes set import_key=null where id=$1",[importedId])),"teacher cannot erase school import identity");
await expectError(importTimetable(A,[{...importClasses[0],room:"다른 강의실"}],importEnrollments.filter(e=>e.class_name===importClasses[0].name)),"reimport refuses to overwrite an existing class");
await expectError(importTimetable(A,[{...importClasses[0],capacity:1}],importEnrollments.filter(e=>e.class_name===importClasses[0].name)),"import checks capacity including existing enrollments");
await expectError(importTimetable(A,[{...importClasses[0],name:"잘못된교사",teacher_id:A}],[{student_id:S1,class_name:"잘못된교사"}]),"admin profile cannot be assigned as a teacher");
await expectError(importTimetable(A,[{...importClasses[0],name:"중복교사시간"}],[{student_id:S1,class_name:"중복교사시간"}]),"import rejects teacher overlap with existing classes");
await expectError(importTimetable(A,[{...importClasses[0],name:"중복강의실",teacher_id:T4}],[{student_id:S1,class_name:"중복강의실"}]),"import rejects room overlap with existing classes");
await expectError(importTimetable(A,[{...importClasses[0],name:"중복학생시간",teacher_id:T4,room:"다른교실"}],[{student_id:S1,class_name:"중복학생시간"}]),"import rejects student overlap and rolls back new class");
ok((await db.query("select id from public.classes where name='중복학생시간'")).rows.length===0,"student conflict leaves no partially created class");
const rollbackClass={...importClasses[0],name:"가져오기 롤백",slots:[{day:2,period:7}],room:"별관 203"};
await expectError(importTimetable(A,[rollbackClass],[{student_id:S1,class_name:rollbackClass.name},{student_id:"00000000-0000-0000-0000-000000000001",class_name:rollbackClass.name}]),"invalid final student rolls back entire import");
ok((await db.query("select id from public.classes where name='가져오기 롤백'")).rows.length===0,"rollback removes class and earlier enrollment inserts");
const manual=(await db.query("insert into public.classes(teacher_id,name,semester,room) values ($1,'기존 수동 수업','2026-2학기','별관 204') returning id",[T])).rows[0].id;
await db.query("insert into public.class_slots(class_id,day,period) values($1,4,7)",[manual]);
const adopted=await importTimetable(A,[{...importClasses[0],name:"기존 수동 수업",room:"별관 204",slots:[{day:4,period:7}]}],[{student_id:S2,class_name:"기존 수동 수업"}]);
ok(adopted.classes_reused===1 && adopted.classes_created===0,"matching manually created class is adopted without duplication");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
