"use client";

import { useState } from "react";
import { DAYS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// 마감 일시 고르기. 자주 쓰는 날짜·시간은 한 번에 누르고, 그 밖의 값은 아래 칸에서 고른다.
// 값은 한국 시간 기준 "2026-11-20T18:00" (datetime-local 형식)으로 폼에 실린다. 서버가 kstLocalToIso 로 바꾼다.

const TIME_PRESETS = [
  { label: "1교시 전", time: "08:30" },
  { label: "점심", time: "12:30" },
  { label: "종례", time: "16:30" },
  { label: "저녁 6시", time: "18:00" },
  { label: "밤 11:59", time: "23:59" },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = ["00", "10", "20", "30", "40", "50", "59"];

// 오늘 날짜(한국 시간)에서 며칠 뒤의 "YYYY-MM-DD". 누를 때만 계산한다. (화면을 그릴 때 현재 시각을 읽지 않는다)
function kstDate(addDays: number) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + addDays)).toISOString().slice(0, 10);
}
function nextMonday() {
  const today = new Date(`${kstDate(0)}T00:00:00Z`).getUTCDay(); // 0=일 ~ 6=토
  return kstDate(((8 - today) % 7) || 7);
}
const DATE_PRESETS = [
  { label: "오늘", pick: () => kstDate(0) },
  { label: "내일", pick: () => kstDate(1) },
  { label: "다음 주 월요일", pick: nextMonday },
  { label: "1주 뒤", pick: () => kstDate(7) },
  { label: "2주 뒤", pick: () => kstDate(14) },
];

function hourLabel(h: number) {
  if (h === 0) return "밤 12시";
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "낮 12시";
  return `오후 ${h - 12}시`;
}

// "2026-11-20", "18:00" -> "11월 20일 (금) 오후 6:00"
function summary(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const [h, min] = time.split(":").map(Number);
  const period = h < 12 ? "오전" : "오후";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${m}월 ${d}일 (${["일", ...DAYS, "토"][weekday]}) ${period} ${hour12}:${String(min).padStart(2, "0")}`;
}

const chip = (active: boolean) =>
  cn(
    "min-h-9 rounded-full border px-3 text-sm transition-colors hover:bg-muted",
    active ? "border-foreground bg-accent font-bold text-accent-foreground hover:bg-accent" : "bg-card text-muted-foreground",
  );

export function DueDateField({
  name,
  defaultValue = "",
  onChange,
}: {
  name: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const [date, setDate] = useState(defaultValue.slice(0, 10));
  const [time, setTime] = useState(defaultValue.slice(11, 16) || "23:59");
  const value = date ? `${date}T${time}` : "";

  function update(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    onChange?.(nextDate ? `${nextDate}T${nextTime}` : "");
  }

  const [hour, minute] = time.split(":");
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <legend className="sr-only">마감 일시</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">마감 일시</span>
        <span className={cn("text-base font-bold", !date && "text-sm font-normal text-muted-foreground")} aria-live="polite">
          {date ? `${summary(date, time)} 마감` : "날짜를 골라 주세요"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">날짜</span>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => (
            <button key={p.label} type="button" className={chip(false)} onClick={() => update(p.pick(), time)}>
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          aria-label="날짜 직접 고르기"
          value={date}
          onChange={(e) => update(e.target.value, time)}
          className="form-select sm:max-w-56"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">시간</span>
        <div className="flex flex-wrap gap-2">
          {TIME_PRESETS.map((p) => (
            <button key={p.time} type="button" aria-pressed={time === p.time} className={chip(time === p.time)} onClick={() => update(date, p.time)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select aria-label="시" value={Number(hour)} onChange={(e) => update(date, `${e.target.value.padStart(2, "0")}:${minute}`)} className="form-select sm:max-w-36">
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
          <select aria-label="분" value={minute} onChange={(e) => update(date, `${hour}:${e.target.value}`)} className="form-select sm:max-w-28">
            {/* 프리셋이나 예전 값이 목록에 없는 분이면 그 값도 보여 준다 */}
            {(MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort()).map((m) => (
              <option key={m} value={m}>{m}분</option>
            ))}
          </select>
        </div>
      </div>
    </fieldset>
  );
}
