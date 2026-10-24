import { BookOpen, CalendarDays, Megaphone } from "lucide-react";
import { SchoolBrand } from "@/components/school-brand";
import { SCHOOL_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="grid min-h-dvh flex-1 border-t-[3px] border-t-school-navy bg-background lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r bg-[#eaf0f4] p-10 xl:p-16 lg:flex">
        <SchoolBrand href="/login" />
        <div className="max-w-md py-16"><span className="mb-6 block h-0.5 w-10 bg-school-gold" />
          <h1 className="text-4xl leading-snug font-semibold tracking-tight text-school-navy xl:text-5xl">배움의 하루를,<br />한곳에서.</h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-muted-foreground">서로 다른 시간표로 시작해도,<br />수업과 과제, 학교 소식은 {SCHOOL_NAME}에서 함께합니다.</p>
          <div className="mt-12 flex flex-col gap-5">{[
            {icon:CalendarDays,title:"나에게 맞는 시간표",text:"참여한 수업으로 완성되는 나의 하루"},
            {icon:BookOpen,title:"수업과 과제",text:"과제 확인부터 제출 기록까지 한곳에서"},
            {icon:Megaphone,title:"놓치지 않는 수업 공지",text:"선생님과 학생이 함께 확인하는 소식"},
          ].map(({icon:Icon,title,text})=><div key={title} className="flex items-center gap-4"><span className="flex size-10 items-center justify-center rounded-lg border border-primary/15 text-primary"><Icon className="size-5" strokeWidth={1.5} /></span><div><p className="text-sm font-semibold text-school-navy">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{text}</p></div></div>)}</div>
        </div>
        <p className="text-xs text-muted-foreground">우리의 수업, 우리의 학교생활.</p>
      </aside>
      <div className="flex min-w-0 flex-col px-5 py-6 sm:px-8">
        <div className="lg:hidden"><SchoolBrand href="/login" /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}
          <p className="mt-6 text-center text-[11px] text-muted-foreground">{SCHOOL_NAME} · 학교생활 통합 포털</p>
        </div>
      </div>
    </main>
  );
}
