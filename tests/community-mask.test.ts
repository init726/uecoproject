import { test } from "node:test";
import assert from "node:assert/strict";
import { maskBannedWords } from "../src/lib/community-mask";

const mask = (text: string) => maskBannedWords(text).text;

test("banned words become same-length asterisks", () => {
  assert.equal(mask("씨발"), "**");
  assert.equal(mask("너 정말 개새끼야"), "너 정말 ***야");
  assert.equal(mask("병신 같네"), "** 같네");
  assert.equal(mask("미친놈아"), "***아");
});

test("symbols or digits slipped between letters are still caught", () => {
  assert.equal(mask("씨1발"), "***");
  assert.equal(mask("씨.발"), "***");
  assert.equal(mask("씨_발"), "***");
  assert.equal(mask("씨!!발"), "****");
});

test("several hits in one text are all replaced", () => {
  assert.equal(mask("씨발 그리고 씨발"), "** 그리고 **");
  assert.equal(mask("지랄 병신 지랄"), "** ** **");
});

test("whole-word entries only match standalone words", () => {
  assert.equal(mask("시발"), "**");
  assert.equal(mask("그냥 시발 진짜"), "그냥 ** 진짜");
  assert.equal(mask("ㅅㅂ 짜증나"), "** 짜증나");
  assert.equal(mask("(시발)"), "(**)");
  assert.equal(mask("시발점에서 출발합니다"), "시발점에서 출발합니다");
  assert.equal(mask("ㅅㅂㅅㅂ"), "ㅅㅂㅅㅂ");
  assert.equal(mask("좆같네"), "좆같네"); // 낱말에 붙어 있으면 건드리지 않는다 (목록에서 whole 을 빼면 가려진다)
});

test("spaced-out text is left alone on purpose (avoids ruining normal sentences)", () => {
  assert.equal(mask("홍길동 씨 발표를 시작하겠습니다"), "홍길동 씨 발표를 시작하겠습니다");
  assert.equal(mask("아저씨, 발 조심하세요"), "아저씨, 발 조심하세요");
  assert.equal(mask("씨 발"), "씨 발");
});

test("clean text is returned unchanged with changed=false", () => {
  const clean = "수학 숙제 어떻게 푸나요? 3번 문제가 어려워요.\n두 번째 줄";
  assert.deepEqual(maskBannedWords(clean), { text: clean, changed: false });
  assert.deepEqual(maskBannedWords(""), { text: "", changed: false });
});

test("changed flag and multi-line text", () => {
  assert.deepEqual(maskBannedWords("첫 줄\n씨발\n끝"), { text: "첫 줄\n**\n끝", changed: true });
});

test("regex-special characters in the text do not break matching", () => {
  assert.equal(mask("a+b=c (씨발) [x] {y} $1 ^ | \\ ?"), "a+b=c (**) [x] {y} $1 ^ | \\ ?");
});
