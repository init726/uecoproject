import { validateUsername, normalizeUsername } from "./username";
import type { ClassSlot } from "./types";

export type ImportStudent = { studentNo: string; name: string; username: string; grade: number; homeroom: number; number: number };
export type ImportTeacher = { name: string; username: string; subject: string };
export type ImportClass = { name: string; semester: string; teacherUsername: string; teacherName: string; room: string; slots: ClassSlot[]; capacity: number };
export type ImportEnrollment = { studentNo: string; className: string };
export type SchoolImportPlan = { semester: string; students: ImportStudent[]; teachers: ImportTeacher[]; classes: ImportClass[]; enrollments: ImportEnrollment[] };
export type ImportAccount = { role: "student" | "teacher"; name: string; username: string; studentNo?: string; subject?: string; importKey: string };
export type ImportAccountResult = { role: "student" | "teacher"; name: string; username: string; status: "created" | "existing" | "failed"; password?: string; error?: string };
export type SchoolImportResult = { classes_created: number; classes_reused: number; enrollments_added: number };

export function importAccounts(plan: SchoolImportPlan): ImportAccount[] {
  return [
    ...plan.teachers.map((t) => ({ ...t, role: "teacher" as const, importKey: `teacher:${t.username}` })),
    ...plan.students.map((s) => ({ name: s.name, username: s.username, studentNo: s.studentNo, role: "student" as const,
      importKey: `student:${plan.semester.slice(0, 4)}:${s.studentNo}` })),
  ];
}

export function parseClassSlots(value: string): ClassSlot[] {
  const days = "월화수목금";
  const tokens = value.split(/[,，\n]+/).map((v) => v.trim()).filter(Boolean);
  if (!tokens.length) throw new Error("수업 시간이 비어 있습니다.");
  const slots = tokens.map((token) => {
    const match = /^([월화수목금])(?:요일)?\s*([1-7])(?:교시)?$/.exec(token);
    if (!match) throw new Error(`수업 시간 '${token}'을 확인해 주세요. 월~금, 1~7교시만 가능합니다.`);
    return { day: days.indexOf(match[1]) + 1, period: Number(match[2]) };
  });
  if (new Set(slots.map((s) => `${s.day}-${s.period}`)).size !== slots.length) throw new Error("같은 수업 시간이 중복 입력됐습니다.");
  return slots;
}

export function validateSchoolPlan(plan: SchoolImportPlan): string[] {
  const errors: string[] = [];
  const add = (message: string) => { if (errors.length < 100) errors.push(message); };
  if (!/^\d{4}-[12]학기$/.test(plan.semester)) add("학기는 2026-2학기 형식이어야 합니다.");
  if (plan.students.length < 1 || plan.students.length > 1000) add("학생은 1~1,000명까지 가져올 수 있습니다.");
  if (plan.teachers.length < 1 || plan.teachers.length > 200) add("교사는 1~200명까지 가져올 수 있습니다.");
  if (plan.classes.length < 1 || plan.classes.length > 300) add("클래스는 1~300개까지 가져올 수 있습니다.");
  if (plan.enrollments.length > 15000) add("수강 신청은 15,000건까지 가져올 수 있습니다.");
  const usernames = new Set<string>();
  for (const a of importAccounts(plan)) {
    if (!a.name || a.name.length > 50) add(`${a.username}: 이름은 1~50자여야 합니다.`);
    const invalid = validateUsername(a.username);
    if (invalid || normalizeUsername(a.username) !== a.username) add(`${a.username}: ${invalid ?? "아이디는 소문자로 입력해 주세요."}`);
    if (usernames.has(a.username)) add(`아이디 중복: ${a.username}`);
    usernames.add(a.username);
  }
  const students = new Map<string, ImportStudent>();
  for (const s of plan.students) {
    if (!/^[1-3]\d{4}$/.test(s.studentNo)) add(`잘못된 학번: ${s.studentNo}`);
    if (students.has(s.studentNo)) add(`학번 중복: ${s.studentNo}`);
    students.set(s.studentNo, s);
    if (s.grade !== Number(s.studentNo[0]) || s.homeroom !== Number(s.studentNo.slice(1, 3)) || s.number !== Number(s.studentNo.slice(3))
      || s.homeroom < 1 || s.number < 1) add(`${s.studentNo}: 학번과 학년·반·번호가 일치하지 않습니다.`);
  }
  const teachers = new Map(plan.teachers.map((t) => [t.username, t]));
  for (const t of plan.teachers) if (!t.subject || t.subject.length > 100) add(`${t.username}: 담당 교과를 확인해 주세요.`);
  const classes = new Map<string, ImportClass>();
  const teacherTimes = new Map<string, string>();
  const roomTimes = new Map<string, string>();
  for (const c of plan.classes) {
    if (!c.name || c.name.length > 50 || c.room.length > 30) add(`${c.name}: 과목명은 50자, 강의실은 30자 이내여야 합니다.`);
    if (classes.has(c.name)) add(`클래스명 중복: ${c.name}`);
    classes.set(c.name, c);
    if (c.semester !== plan.semester) add(`${c.name}: 한 파일에는 같은 학기의 수업만 넣어 주세요.`);
    const teacher = teachers.get(c.teacherUsername);
    if (!teacher || teacher.name !== c.teacherName) add(`${c.name}: 담당 교사와 교사계정 시트가 일치하지 않습니다.`);
    if (!Number.isInteger(c.capacity) || c.capacity < 1 || c.capacity > 1000) add(`${c.name}: 정원을 확인해 주세요.`);
    if (!c.slots.length || c.slots.length > 35) add(`${c.name}: 수업 시간을 확인해 주세요.`);
    const seen = new Set<string>();
    for (const s of c.slots) {
      if (!Number.isInteger(s.day) || !Number.isInteger(s.period) || s.day < 1 || s.day > 5 || s.period < 1 || s.period > 7) add(`${c.name}: 잘못된 요일·교시입니다.`);
      const time = `${s.day}-${s.period}`;
      if (seen.has(time)) add(`${c.name}: 수업 시간이 중복됐습니다.`);
      seen.add(time);
      const teacherKey = `${c.teacherUsername}:${time}`;
      if (teacherTimes.has(teacherKey)) add(`교사 시간 충돌: ${c.name} / ${teacherTimes.get(teacherKey)}`);
      teacherTimes.set(teacherKey, c.name);
      if (c.room) {
        const roomKey = `${c.room}:${time}`;
        if (roomTimes.has(roomKey)) add(`강의실 시간 충돌: ${c.name} / ${roomTimes.get(roomKey)}`);
        roomTimes.set(roomKey, c.name);
      }
    }
  }
  const enrollments = new Set<string>();
  const studentTimes = new Map<string, string>();
  const counts = new Map<string, number>();
  const assigned = new Set<string>();
  for (const e of plan.enrollments) {
    const key = `${e.studentNo}:${e.className}`;
    if (enrollments.has(key)) add(`수강 신청 중복: ${e.studentNo} / ${e.className}`);
    enrollments.add(key);
    if (!students.has(e.studentNo)) add(`수강 신청에 없는 학생: ${e.studentNo}`);
    const c = classes.get(e.className);
    if (!c) { add(`수강 신청에 없는 클래스: ${e.className}`); continue; }
    assigned.add(e.studentNo);
    counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    for (const s of c.slots) {
      const time = `${e.studentNo}:${s.day}-${s.period}`;
      if (studentTimes.has(time)) add(`학생 시간 충돌: ${e.studentNo} / ${c.name} / ${studentTimes.get(time)}`);
      studentTimes.set(time, c.name);
    }
  }
  for (const s of plan.students) if (!assigned.has(s.studentNo)) add(`${s.studentNo}: 수강 신청이 없어 시간표를 만들 수 없습니다.`);
  for (const c of plan.classes) if ((counts.get(c.name) ?? 0) > c.capacity) add(`${c.name}: 수강 인원이 정원 ${c.capacity}명을 넘습니다.`);
  return errors;
}
