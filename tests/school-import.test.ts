import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { validateSchoolPlan, parseClassSlots, importAccounts, type SchoolImportPlan } from "../src/lib/school-import";
import { matchImportAccounts, type DirectoryAccount } from "../src/lib/school-import-directory";
import { signSchoolImport, verifySchoolImport } from "../src/lib/school-import-token";
import { readSchoolWorkbook } from "../src/lib/school-import-xlsx";

function fixture(): SchoolImportPlan {
  return { semester: "2026-2학기",
    students: [{ studentNo: "20101", name: "가상학생", username: "202620101", grade: 2, homeroom: 1, number: 1 }],
    teachers: [{ name: "가상교사", username: "teacher01", subject: "문학" }],
    classes: [{ name: "문학 (2-1반)", semester: "2026-2학기", teacherUsername: "teacher01", teacherName: "가상교사", room: "본관 201", slots: [{ day: 1, period: 1 }], capacity: 25 }],
    enrollments: [{ studentNo: "20101", className: "문학 (2-1반)" }],
  };
}

test("valid plan and Korean day/period parsing", () => {
  assert.deepEqual(validateSchoolPlan(fixture()), []);
  assert.deepEqual(parseClassSlots("월3, 화요일 2교시, 수1"), [{day:1,period:3},{day:2,period:2},{day:3,period:1}]);
  assert.throws(() => parseClassSlots("토1"));
  assert.throws(() => parseClassSlots("월8"));
  assert.throws(() => parseClassSlots("월1,월1"));
});
test("duplicate accounts and inconsistent student identity rejected", () => {
  const p = fixture(); p.students.push({...p.students[0]});
  assert.ok(validateSchoolPlan(p).some((s) => s.includes("학번 중복")));
  p.students[0].homeroom = 3;
  assert.ok(validateSchoolPlan(p).some((s) => s.includes("일치하지")));
});
test("missing references and duplicate enrollments rejected", () => {
  const p = fixture(); p.enrollments.push({...p.enrollments[0]});
  assert.ok(validateSchoolPlan(p).some((s) => s.includes("수강 신청 중복")));
  p.enrollments = [{studentNo:"29999",className:"없는과목"}];
  assert.ok(validateSchoolPlan(p).some((s) => s.includes("없는 학생")));
  assert.ok(validateSchoolPlan(p).some((s) => s.includes("없는 클래스")));
});
test("student, teacher and room conflicts are independently detected", () => {
  const p = fixture(); p.classes.push({...p.classes[0],name:"다른 수업"});
  p.enrollments.push({studentNo:"20101",className:"다른 수업"});
  const errors = validateSchoolPlan(p);
  for (const term of ["학생 시간 충돌","교사 시간 충돌","강의실 시간 충돌"]) assert.ok(errors.some((s) => s.includes(term)));
});
test("capacity, missing assignments, multiple semesters and teacher mismatch rejected", () => {
  const p = fixture(); p.classes[0].capacity = 0; p.classes[0].teacherName="다른이름"; p.classes[0].semester="2026-1학기";
  p.enrollments=[];
  const errors=validateSchoolPlan(p);
  for(const term of ["정원","담당 교사","같은 학기","수강 신청이 없어"]) assert.ok(errors.some((s)=>s.includes(term)));
});
const existing: DirectoryAccount = { id:"student-id",email:"202620101@id.invalid",name:"가상학생",role:"student",studentNo:"20101",approved:true };
test("existing accounts are reused and changed identities are blocked", () => {
  const p=fixture();
  assert.equal(matchImportAccounts(p,[existing])[1].existing?.id,"student-id");
  assert.ok(matchImportAccounts(p,[{...existing,name:"다른학생"}])[1].error);
  assert.ok(matchImportAccounts(p,[{...existing,role:"admin"}])[1].error);
  assert.ok(matchImportAccounts(p,[{...existing,email:"renamed@id.invalid"}])[1].error);
});
test("stable import key finds renamed account without resetting its identity", () => {
  const directory=[{...existing,email:"renamed@id.invalid",importKey:"student:2026:20101"}];
  assert.equal(matchImportAccounts(fixture(),directory)[1].existing?.id,"student-id");
  assert.ok(matchImportAccounts(fixture(),[...directory,{...existing,id:"another-id"}])[1].error);
});
test("pending teacher is not silently approved", () => {
  const teacher:DirectoryAccount={id:"t",email:"teacher01@id.invalid",name:"가상교사",role:"teacher",studentNo:null,approved:false};
  assert.ok(matchImportAccounts(fixture(),[teacher])[0].error?.includes("먼저 승인"));
});
test("preview is signed, expires and is bound to the reviewing administrator", () => {
  const token=signSchoolImport(fixture(),"admin","test-key",100);
  assert.deepEqual(verifySchoolImport(token,"admin","test-key",200),fixture());
  assert.throws(()=>verifySchoolImport(token,"other-admin","test-key",200));
  assert.throws(()=>verifySchoolImport(token,"admin","other-key",200));
  assert.throws(()=>verifySchoolImport(token,"admin","test-key",3600100));
  assert.throws(()=>verifySchoolImport(token+".","admin","test-key",200));
  const [body,sig]=token.split('.');
  const changed=JSON.parse(Buffer.from(body,'base64url').toString()); changed.plan.students[0].name="변조";
  assert.throws(()=>verifySchoolImport(Buffer.from(JSON.stringify(changed)).toString('base64url')+'.'+sig,"admin","test-key",200));
});
test("import plan contains no password, phone or gender fields", () => {
  const data=JSON.stringify(importAccounts(fixture()));
  for(const term of ["password","phone","gender"]) assert.ok(!data.includes(term));
});
test("provided workbook: 100 students, 32 teachers, 42 classes, 900 enrollments", async (t) => {
  const file=process.env.IMPORT_WORKBOOK ?? "outputs/2학년_100명_학점제시간표.xlsx";
  try { await access(file); } catch { t.skip("사용자가 제공한 엑셀은 Git에 포함하지 않습니다."); return; }
  const bytes=await readFile(file);
  const p=await readSchoolWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.deepEqual([p.students.length,p.teachers.length,p.classes.length,p.enrollments.length],[100,32,42,900]);
  assert.deepEqual(validateSchoolPlan(p),[]);
  assert.ok(!JSON.stringify(p).includes("password"));
});
test("invalid or oversized workbook rejected", async () => {
  await assert.rejects(()=>readSchoolWorkbook(new ArrayBuffer(900001)),/900KB/);
  await assert.rejects(()=>readSchoolWorkbook(new TextEncoder().encode('not an excel file').buffer),/시트를 읽을 수 없습니다/);
});
