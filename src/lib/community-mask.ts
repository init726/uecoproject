// 금칙어 가리기: 글·댓글을 저장하기 전에 금칙어를 '*'로 바꾼다. (데이터베이스는 쓰지 않는다)
//
// 목록은 아래 BANNED_WORDS 에서 고친다.
//   word  : 금칙어
//   whole : true 이면 앞뒤에 글자가 붙어 있지 않을 때만 바꾼다. ("시발점"처럼 정상 낱말에 들어 있는 경우를 피할 때)
//           false(생략) 이면 어디에 들어 있든 바꾼다. 글자 사이에 기호·숫자를 끼운 것도 잡는다. ("씨1발", "씨.발")
// 띄어 쓴 것("씨 발")은 일부러 잡지 않는다. "홍길동 씨 발표"처럼 정상 문장이 걸려 글이 망가지기 때문이다.
// 어디까지나 단순 치환이라 새로 만든 표기는 통과한다. 그럴 때는 목록에 단어를 더하거나 신고 기능을 쓴다.

export type BannedWord = { word: string; whole?: boolean };

export const BANNED_WORDS: BannedWord[] = [
  { word: "씨발" },
  { word: "씨팔" },
  { word: "개새끼" },
  { word: "병신" },
  { word: "미친놈" },
  { word: "미친년" },
  { word: "느금마" },
  { word: "시발", whole: true },
  { word: "ㅅㅂ", whole: true },
  { word: "ㅆㅂ", whole: true },
  { word: "ㅂㅅ", whole: true },
  { word: "좆", whole: true },
  { word: "지랄", whole: true },
];

const MASK_CHAR = "*";
// 낱말을 이루는 글자 (한글 음절·자모, 영문자, 숫자)
const WORD_CHARS = "가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9";
// 금칙어 글자 사이에 끼워 넣을 수 있는 것: 공백이 아닌 기호·숫자를 최대 2개
const GAP = "[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z\\s]{0,2}";

const escapeChar = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile({ word, whole }: BannedWord) {
  const chars = [...word].map(escapeChar);
  return whole
    ? new RegExp(`(?<![${WORD_CHARS}])${chars.join("")}(?![${WORD_CHARS}])`, "giu")
    : new RegExp(chars.join(GAP), "giu");
}

const RULES = BANNED_WORDS.map(compile);

// 금칙어를 같은 길이의 '*'로 바꾼 글과, 바뀐 곳이 있었는지를 돌려준다.
export function maskBannedWords(text: string): { text: string; changed: boolean } {
  let changed = false;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule, (match) => {
      changed = true;
      return MASK_CHAR.repeat([...match].length);
    });
  }
  return { text: out, changed };
}
