"use client";
import { useState,useTransition } from "react";
import { deadlineLoad } from "@/app/(main)/classes/[classId]/assignments/new/actions";
import { Button } from "@/components/ui/button";
export type DeadlineRow={load_day:string;assignment_count:number;student_count:number;max_per_student:number;class_names:string[]};
export function DeadlineLoad({classId,day}:{classId:string;day:string}) {
 const [result,setResult]=useState<{rows?:DeadlineRow[];error?:string}>({});const [checked,setChecked]=useState("");const [pending,start]=useTransition();
 return <section className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">마감일 과제 몰림 확인</h3><Button type="button" size="sm" variant="outline" disabled={!day||pending} onClick={()=>start(async()=>{setResult(await deadlineLoad(classId,day));setChecked(day);})}>{pending?"조회 중…":"선택한 날짜 확인"}</Button></div><div role="status" className="mt-2 text-sm text-muted-foreground">{checked!==day?"마감일을 선택한 뒤 조회하면 수강생의 다른 과제 마감 수를 확인할 수 있습니다.":result.error??(result.rows?.length?result.rows.map(r=>`${r.load_day}: ${r.assignment_count}개 과제 · 해당 학생 ${r.student_count}명 · 학생 1명당 최대 ${r.max_per_student}개 (${r.class_names.join(", ")})`).join("\n"):"선택한 날짜에 겹치는 과제 마감이 없습니다.")}</div></section>;
}
