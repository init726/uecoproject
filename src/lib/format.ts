import { DAYS } from "@/lib/constants";
import type { ClassSlot } from "@/lib/types";

// 서버(Vercel)는 미국 시간대일 수 있으므로 날짜는 항상 한국 시간으로 계산한다.
const TIME_ZONE = "Asia/Seoul";

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// <input type="datetime-local"> 값("2026-11-03T18:00")을 한국 시간으로 보고 ISO 문자열로 바꾼다.
export function kstLocalToIso(local: string) {
  const date = new Date(`${local}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now();
}

// 오늘이 한국 시간으로 무슨 요일인지 (1=월 ~ 5=금, 주말은 null)
export function kstWeekday(): number | null {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(
    new Date(),
  );
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri"].indexOf(name) + 1;
  return day === 0 ? null : day;
}

// "3일 남음", "5시간 남음", "마감 지남"
export function formatRemaining(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "마감 지남";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "1시간 안에 마감";
  if (hours < 24) return `${hours}시간 남음`;
  return `${Math.floor(hours / 24)}일 남음`;
}

export function formatSlots(slots: ClassSlot[]) {
  return [...slots]
    .sort((a, b) => a.day - b.day || a.period - b.period)
    .map((s) => `${DAYS[s.day - 1]}${s.period}`)
    .join(", ");
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// 글자 수: 이모지 같은 글자도 1자로 센다. (데이터베이스의 char_length와 같은 방식)
export function countChars(text: string) {
  return [...text].length;
}
