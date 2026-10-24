import "server-only";
import { createHmac, randomBytes } from "node:crypto";

// 문자 발송 (솔라피 https://solapi.com).
// .env.local에 SOLAPI_API_KEY, SOLAPI_API_SECRET, SMS_SENDER(사전 등록한 발신번호)가 있어야 보낸다.
// 설정이 없으면 smsReady()가 false이고, 발급은 문자 없이 진행된다.

export function smsReady() {
  return Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SMS_SENDER);
}

// 010-1234-5678, 01012345678 → 01012345678. 휴대폰 번호가 아니면 null.
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^01\d{8,9}$/.test(digits) ? digits : null;
}

export type SmsResult = { to: string; ok: boolean; reason?: string };

export async function sendSms(messages: { to: string; text: string }[]): Promise<SmsResult[]> {
  if (messages.length === 0) return [];
  if (!smsReady()) return messages.map((m) => ({ to: m.to, ok: false, reason: "문자 설정 없음" }));

  const apiKey = process.env.SOLAPI_API_KEY!;
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", process.env.SOLAPI_API_SECRET!).update(date + salt).digest("hex");

  try {
    const response = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({ to: m.to, from: process.env.SMS_SENDER, text: m.text })),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      failedMessageList?: { to: string; statusMessage?: string }[];
      errorMessage?: string;
    };
    if (!response.ok) {
      const reason = body.errorMessage ?? `발송 실패 (${response.status})`;
      return messages.map((m) => ({ to: m.to, ok: false, reason }));
    }
    const failed = new Map((body.failedMessageList ?? []).map((f) => [f.to, f.statusMessage ?? "발송 실패"]));
    return messages.map((m) => ({ to: m.to, ok: !failed.has(m.to), reason: failed.get(m.to) }));
  } catch {
    return messages.map((m) => ({ to: m.to, ok: false, reason: "문자 서버에 연결하지 못함" }));
  }
}
