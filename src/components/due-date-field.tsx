"use client";

import { useId, useState } from "react";
import { DAYS } from "@/lib/constants";

// 마감 일시: 연도는 고정(과제를 내는 해), 월·일은 직접 입력, 시간은 정시 단위로 고른다.
// 값은 한국 시간 기준 "2026-11-20T18:00" (datetime-local 형식)으로 폼에 실린다. 서버가 kstLocalToIso 로 바꾼다.

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number) {
  if (h === 0) return "밤 12시";
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "낮 12시";
  return `오후 ${h - 12}시`;
}

// 그 해에 실제로 있는 날짜인지 (2월 30일 등은 거른다)
function validDate(year: number, month: number, day: number) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, "0");

export function DueDateField({
  name,
  year,
  defaultValue = "",
  onChange,
}: {
  name: string;
  year: number;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const id = useId();
  const [month, setMonth] = useState(defaultValue ? String(Number(defaultValue.slice(5, 7))) : "");
  const [day, setDay] = useState(defaultValue ? String(Number(defaultValue.slice(8, 10))) : "");
  const [hour, setHour] = useState(defaultValue ? Number(defaultValue.slice(11, 13)) : 23);

  const m = Number(month);
  const d = Number(day);
  const ok = month !== "" && day !== "" && validDate(year, m, d);
  const value = ok ? `${year}-${pad(m)}-${pad(d)}T${pad(hour)}:00` : "";

  function update(nextMonth: string, nextDay: string, nextHour: number) {
    setMonth(nextMonth);
    setDay(nextDay);
    setHour(nextHour);
    const nm = Number(nextMonth);
    const nd = Number(nextDay);
    const nextOk = nextMonth !== "" && nextDay !== "" && validDate(year, nm, nd);
    onChange?.(nextOk ? `${year}-${pad(nm)}-${pad(nd)}T${pad(nextHour)}:00` : "");
  }

  const weekday = ok ? ["일", ...DAYS, "토"][new Date(Date.UTC(year, m - 1, d)).getUTCDay()] : "";
  const typed = month !== "" && day !== "";

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">마감 일시</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{year}년</span>
        <input
          id={`${id}-month`}
          aria-label="월"
          inputMode="numeric"
          value={month}
          onChange={(e) => update(e.target.value.replace(/\D/g, "").slice(0, 2), day, hour)}
          placeholder="월"
          className="form-select w-16 text-center"
        />
        <label htmlFor={`${id}-month`} className="text-sm">월</label>
        <input
          id={`${id}-day`}
          aria-label="일"
          inputMode="numeric"
          value={day}
          onChange={(e) => update(month, e.target.value.replace(/\D/g, "").slice(0, 2), hour)}
          placeholder="일"
          className="form-select w-16 text-center"
        />
        <label htmlFor={`${id}-day`} className="text-sm">일</label>
        {weekday && <span className="text-sm text-muted-foreground">({weekday})</span>}
        <select
          aria-label="시간"
          value={hour}
          onChange={(e) => update(month, day, Number(e.target.value))}
          className="form-select w-auto"
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>{hourLabel(h)}</option>
          ))}
        </select>
      </div>
      <p className={typed && !ok ? "text-xs text-destructive" : "text-xs text-muted-foreground"} aria-live="polite">
        {typed && !ok
          ? `${year}년에 없는 날짜예요. 월과 일을 다시 확인해 주세요.`
          : ok
            ? `${m}월 ${d}일 (${weekday}) ${hourLabel(hour)} 정각에 마감돼요.`
            : "월과 일을 숫자로 입력해 주세요."}
      </p>
    </fieldset>
  );
}
