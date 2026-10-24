// 아이디 로그인.
// Supabase 로그인은 이메일이 꼭 필요해서, 아이디 "202620315"를 내부적으로
// "202620315@id.invalid"로 저장한다. (.invalid는 메일이 절대 배달되지 않는 예약 도메인)
// 사용자 화면에는 아이디만 보여준다. '@'가 들어간 값은 예전 이메일 계정으로 그대로 쓴다.

export const LOGIN_DOMAIN = "id.invalid";
export const USERNAME_RULE = "영문 소문자, 숫자, _ 로 4~20자";

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

// 문제가 없으면 null, 있으면 안내 문구
export function validateUsername(username: string): string | null {
  if (!/^[a-z0-9_]{4,20}$/.test(username)) return `아이디는 ${USERNAME_RULE}예요.`;
  return null;
}

export function toAuthEmail(loginId: string) {
  const id = normalizeUsername(loginId);
  return id.includes("@") ? id : `${id}@${LOGIN_DOMAIN}`;
}

export function displayLoginId(email: string | undefined | null) {
  if (!email) return "";
  const suffix = `@${LOGIN_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

// 학생 기본 아이디: 발급 연도 + 학번 (예: 2026년 20315 → 202620315). 해마다 학번이 바뀌어도 겹치지 않는다.
export function defaultStudentUsername(year: number, studentNo: string) {
  return `${year}${studentNo}`;
}
