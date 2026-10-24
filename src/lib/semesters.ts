import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Semester = { id: string; academic_year: number | null; term: number | null };

export function currentSemester(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "numeric",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return `${year}-${month >= 8 ? 2 : 1}학기`;
}

export const getSemesters = cache(async (): Promise<Semester[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("semesters")
    .select("id, academic_year, term").order("academic_year", { ascending: false, nullsFirst: false })
    .order("term", { ascending: false });
  if (error) throw new Error("학기 목록을 불러오지 못했어요. 시간표 DB 업데이트 적용 여부를 확인해 주세요.");
  return data ?? [];
});

export function selectSemester(semesters: Semester[], requested?: string) {
  if (requested && semesters.some((s) => s.id === requested)) return requested;
  const current = currentSemester();
  return semesters.some((s) => s.id === current) ? current : semesters[0]?.id ?? current;
}
