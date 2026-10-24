import "server-only";
import { randomInt } from "node:crypto";

// 발급·초기화용 임시 비밀번호. 헷갈리는 글자(0/O, 1/l/I)는 뺐다.
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

const pick = (chars: string) => chars[randomInt(chars.length)];
const chunk = () => pick(UPPER) + pick(LOWER) + pick(LOWER) + pick(DIGITS);

// 예: Kmt4-Hqz7-Wpa2
export function generatePassword() {
  return [chunk(), chunk(), chunk()].join("-");
}
