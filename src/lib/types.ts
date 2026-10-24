// 데이터베이스 테이블 모양 (supabase/schema.sql 과 같아야 한다)

export type Role = "student" | "teacher" | "admin";
export type AssignmentType = "file" | "text";

export type Profile = {
  id: string;
  name: string;
  role: Role;
  student_no: string | null;
  subject: string | null;
  approved: boolean;
};

export type ClassSlot = {
  day: number; // 1=월 ~ 5=금
  period: number; // 1~7교시
};

export type ClassRow = {
  id: string;
  teacher_id: string;
  name: string;
  semester: string;
  room: string | null;
  invite_code: string;
  import_key?: string | null;
};

export type Notice = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export type Assignment = {
  id: string;
  class_id: string;
  title: string;
  description: string;
  rubric: string;
  due_at: string;
  type: AssignmentType;
  max_chars: number | null;
  allow_late: boolean;
  purpose: "self_review" | null;
};

export type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  version: number;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  content: string | null;
  submitted_at: string;
  is_late: boolean;
  canceled_at: string | null;
};

// 서버 액션이 폼에 돌려주는 결과
export type ActionState = { error?: string; message?: string };

// ---- 커뮤니티 (supabase/community.sql) ----

export type PostKind = "notice" | "question" | "free";
// 게시 중 / 검토 중(숨김) / 삭제됨
export type ContentStatus = "published" | "review" | "deleted";

export type Post = {
  id: string;
  author_id: string;
  author_name: string;
  author_role: Role;
  kind: PostKind;
  title: string;
  body: string;
  pinned: boolean;
  status: ContentStatus;
  // 질문 글에서 글쓴이가 채택한 댓글. 있으면 "해결됨"이다.
  accepted_comment_id: string | null;
  // 게시 중인 댓글 수와 마지막 활동(댓글 또는 작성) 시각. 정렬용이며 트리거가 맞춰 둔다.
  comment_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_role: Role;
  body: string;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
};
