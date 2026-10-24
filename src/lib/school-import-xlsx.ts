import { readSheet as readXlsxSheet } from "read-excel-file/node";
import { normalizeUsername } from "./username";
import { parseClassSlots, validateSchoolPlan, type SchoolImportPlan } from "./school-import";

const REQUIRED = {
  학생계정: ["학번", "이름", "학년", "반", "번호", "아이디"],
  교사계정: ["이름", "담당 교과", "아이디"],
  개설클래스: ["클래스명(앱 과목명)", "학기", "담당 교사", "교사 아이디", "강의실", "요일·교시", "정원"],
  수강신청: ["학번", "클래스"],
};

// 안내 문구는 지시로 처리하지 않는다. 임시 비밀번호·성별·연락처는 가져오지 않으며 수식은 실행하지 않는다.
export async function readSchoolWorkbook(buffer: ArrayBuffer): Promise<SchoolImportPlan> {
  if (buffer.byteLength > 900_000) throw new Error("엑셀 파일은 900KB 이하로 올려 주세요.");
  const sheets = new Map(await Promise.all((Object.keys(REQUIRED) as (keyof typeof REQUIRED)[]).map(async (name) => {
    try { return [name, await readXlsxSheet(Buffer.from(buffer), name)] as const; }
    catch { throw new Error(`'${name}' 시트를 읽을 수 없습니다. 시트 이름과 .xlsx 형식을 확인해 주세요.`); }
  })));
  const readSheet = (name: keyof typeof REQUIRED) => {
    const sheet = sheets.get(name)!;
    if (sheet.length > 15001 || sheet.some((row) => row.length > 100)) throw new Error(`${name}: 허용한 행·열 수를 넘었습니다.`);
    const headers = new Map<string, number>();
    sheet[0]?.forEach((cell, col) => headers.set(String(cell ?? "").trim(), col));
    for (const title of REQUIRED[name]) if (!headers.has(title)) throw new Error(`${name}: '${title}' 열이 필요합니다.`);
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < sheet.length; i++) {
      const row: Record<string, string> = {};
      for (const title of REQUIRED[name]) {
        const cell = sheet[i][headers.get(title)!];
        if (cell instanceof Date || typeof cell === "boolean") throw new Error(`${name} ${i + 1}행: '${title}'에 올바른 값을 넣어 주세요.`);
        row[title] = String(cell ?? "").trim();
      }
      if (name === "개설클래스" && /^합계(?:\s|\(|$)/.test(row["클래스명(앱 과목명)"])
        && REQUIRED[name].slice(1).every((title) => !row[title])) continue;
      if (Object.values(row).some(Boolean)) rows.push(row);
    }
    return rows;
  };
  const students = readSheet("학생계정").map((r) => ({ studentNo: r.학번, name: r.이름, username: normalizeUsername(r.아이디),
    grade: Number(r.학년), homeroom: Number(r.반), number: Number(r.번호) }));
  const teachers = readSheet("교사계정").map((r) => ({ name: r.이름, username: normalizeUsername(r.아이디), subject: r["담당 교과"] }));
  const classes = readSheet("개설클래스").map((r) => {
    let slots;
    try { slots = parseClassSlots(r["요일·교시"]); } catch (e) { throw new Error(`${r["클래스명(앱 과목명)"]}: ${(e as Error).message}`); }
    return { name: r["클래스명(앱 과목명)"], semester: r.학기, teacherUsername: normalizeUsername(r["교사 아이디"]),
      teacherName: r["담당 교사"], room: r.강의실, slots, capacity: Number(r.정원) };
  });
  const enrollments = readSheet("수강신청").map((r) => ({ studentNo: r.학번, className: r.클래스 }));
  const plan = { semester: classes[0]?.semester ?? "", students, teachers, classes, enrollments };
  const errors = validateSchoolPlan(plan);
  if (errors.length) throw new Error(errors.slice(0, 12).join("\n"));
  return plan;
}
