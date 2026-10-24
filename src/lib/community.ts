import { POST_KIND_LABEL } from "@/lib/constants";
import type { PostKind, Profile } from "@/lib/types";

// community.sql 의 함수·트리거는 사람이 읽을 수 있는 한국어 문구로 예외를 던진다. (코드 P0001)
// 그 문구는 그대로 보여 주고, 권한 거부·제약 위반 같은 그 밖의 오류는 일반 문구로 바꾼다.
export function dbMessage(error: { code?: string; message: string }, fallback: string) {
  return error.code === "P0001" ? error.message : fallback;
}

export function isPostKind(value: unknown): value is PostKind {
  return typeof value === "string" && value in POST_KIND_LABEL;
}

// 이 사람이 쓸 수 있는 말머리. 학교 공지는 관리자만, 관리자는 공지만.
// (데이터베이스 트리거가 같은 규칙을 한 번 더 강제한다)
export function writableKinds(profile: Profile): PostKind[] {
  return profile.role === "admin" ? ["notice"] : ["question", "free"];
}
