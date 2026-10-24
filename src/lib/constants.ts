export const DAYS = ["월", "화", "수", "목", "금"] as const;
export const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;

// 저장소 정책(schema.sql)과 같은 목록이어야 한다.
export const ALLOWED_EXTENSIONS = ["pdf", "hwp", "hwpx", "docx", "jpg", "jpeg", "png", "zip"];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ROLE_LABEL = {
  student: "학생",
  teacher: "교사",
  admin: "관리자",
} as const;
