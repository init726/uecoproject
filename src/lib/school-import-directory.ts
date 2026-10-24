import { importAccounts, type ImportAccount, type SchoolImportPlan } from "./school-import";
import { toAuthEmail } from "./username";

export type DirectoryAccount = { id: string; email: string; name: string; role: string; studentNo: string | null; approved: boolean; importKey?: string };
export type AccountMatch = { account: ImportAccount; existing?: DirectoryAccount; error?: string };

export function matchImportAccounts(plan: SchoolImportPlan, directory: DirectoryAccount[]): AccountMatch[] {
  return importAccounts(plan).map((account) => {
    const matches = directory.filter((d) => d.importKey === account.importKey || d.email.toLowerCase() === toAuthEmail(account.username));
    if (matches.length > 1) return { account, error: `${account.username}: 계정 연결이 모호합니다. 기존 아이디와 가져오기 기록을 확인해 주세요.` };
    const existing = matches[0];
    if (!existing) {
      if (account.role === "student" && directory.some((d) => d.role === "student" && d.studentNo === account.studentNo)) {
        return { account, error: `${account.studentNo}: 같은 학번의 다른 아이디가 있습니다. 학생계정 시트의 아이디를 기존 계정에 맞춰 주세요.` };
      }
      return { account };
    }
    if (existing.role !== account.role || existing.name !== account.name || (account.role === "student" && existing.studentNo !== account.studentNo)) {
      return { account, error: `${account.username}: 기존 계정의 이름·역할·학번이 엑셀과 다릅니다. 기존 계정은 변경하지 않습니다.` };
    }
    if (account.role === "teacher" && !existing.approved) return { account, error: `${account.username}: 기존 교사를 먼저 승인해 주세요.` };
    return { account, existing };
  });
}
