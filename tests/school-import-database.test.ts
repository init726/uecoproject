import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { dbStub } from "../supabase/test-support.mjs";
import { readSchoolWorkbook } from "../src/lib/school-import-xlsx";

test("full workbook imports 132 accounts' profiles, 42 classes and 900 enrollments in isolated PostgreSQL", async (t) => {
  const file=process.env.IMPORT_WORKBOOK ?? "outputs/2학년_100명_학점제시간표.xlsx";
  try { await access(file); } catch { t.skip("사용자 엑셀은 저장소에 포함하지 않습니다."); return; }
  const bytes=await readFile(file);
  const plan=await readSchoolWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const db=new PGlite();
  try {
    await db.exec(dbStub);
    await db.exec(await readFile("supabase/schema.sql","utf8"));
    await db.query("insert into public.semesters(id,academic_year,term) values('2026-2학기',2026,2) on conflict do nothing");
    const ids=new Map<string,string>();
    for(const person of [...plan.teachers.map(p=>({...p,role:"teacher",studentNo:""})),...plan.students.map(p=>({...p,role:"student"}))]) {
      const row=(await db.query<{id:string}>("insert into auth.users(email,raw_user_meta_data) values($1,$2) returning id",[
        person.username+"@id.invalid",JSON.stringify({name:person.name,role:person.role,student_no:person.studentNo,privacy_agreed:"true"}),
      ])).rows[0];
      ids.set(person.username,row.id);
    }
    const admin=(await db.query<{id:string}>("insert into auth.users(email,raw_user_meta_data) values('admin@test.invalid','{\"name\":\"테스트관리자\",\"privacy_agreed\":\"true\"}') returning id")).rows[0].id;
    await db.query("update public.profiles set approved=true where role='teacher'");
    await db.query("update public.profiles set role='admin',approved=true where id=$1",[admin]);
    const studentIds=new Map(plan.students.map(s=>[s.studentNo,ids.get(s.username)!]));
    const classes=plan.classes.map(c=>({name:c.name,teacher_id:ids.get(c.teacherUsername),room:c.room,slots:c.slots,capacity:c.capacity}));
    const enrollments=plan.enrollments.map(e=>({student_id:studentIds.get(e.studentNo),class_name:e.className}));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
    await db.query("set role authenticated");
    const call=async()=> (await db.query<{r:{classes_created:number;classes_reused:number;enrollments_added:number}}>(
      "select public.import_school_timetable($1,$2::jsonb,$3::jsonb) as r",[plan.semester,JSON.stringify(classes),JSON.stringify(enrollments)],
    )).rows[0].r;
    assert.deepEqual(await call(),{classes_created:42,classes_reused:0,enrollments_added:900});
    assert.deepEqual(await call(),{classes_created:0,classes_reused:42,enrollments_added:0});
    await db.query("reset role");
    assert.equal((await db.query<{n:number}>("select count(*)::int as n from public.profiles where role='student'")).rows[0].n,100);
    assert.equal((await db.query<{n:number}>("select count(*)::int as n from public.profiles where role='teacher'")).rows[0].n,32);
    assert.equal((await db.query("select student_id from public.enrollments group by student_id having count(*)<>9")).rows.length,0);
    assert.equal((await db.query("select e.student_id,s.day,s.period from public.enrollments e join public.class_slots s on s.class_id=e.class_id group by e.student_id,s.day,s.period having count(*)>1")).rows.length,0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[studentIds.get("20101")]);
    await db.query("set role authenticated");
    assert.equal((await db.query("select * from public.classes")).rows.length,9);
    assert.equal((await db.query("select * from public.class_slots")).rows.length,28);
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.get("t202601")]);
    await db.query("set role authenticated");
    assert.equal((await db.query("select * from public.classes")).rows.length,2);
    assert.equal((await db.query("select * from public.enrollments")).rows.length,50);
  } finally { await db.close(); }
});
