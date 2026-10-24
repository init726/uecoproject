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

// ---- 커뮤니티 ----
export const POST_KIND_LABEL = {
  notice: "학교 공지",
  question: "질문",
  free: "자유",
} as const;

export const CONTENT_STATUS_LABEL = {
  published: "게시 중",
  review: "검토 중",
  deleted: "삭제됨",
} as const;

export const COMMUNITY_PAGE_SIZE = 15;
// community.sql 의 길이 제한과 같아야 한다.
export const POST_TITLE_MAX = 100;
export const POST_BODY_MAX = 5000;
export const COMMENT_MAX = 1000;
export const REASON_MAX = 300;
