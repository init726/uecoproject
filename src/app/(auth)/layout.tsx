import { BookOpen, CalendarDays, Megaphone } from "lucide-react";
import { SchoolBrand } from "@/components/school-brand";
import { ThemeToggle } from "@/components/theme-toggle";

// 강조할 낱말 위에 형광 연두 띠를 두른다. (라이트·다크 모두 같은 연두 + 검정 글자)
function Mark({ children }: { children: React.ReactNode }) {
  // inline-block + 줄 높이 고정: 띠 하나가 자기 줄 안에서만 차지하므로 위아래 줄의 띠와 겹치지 않는다.
  return <mark className="inline-block rounded-2xl bg-school-gold px-3 text-black">{children}</mark>;
}

// 로그인·가입 화면 틀: 위쪽 줄(로고 + 모드 전환), 왼쪽 소개 카드, 오른쪽 폼 카드
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b px-5 sm:px-8">
        <SchoolBrand href="/login" subtitle="" />
        <ThemeToggle />
      </header>

      <main id="main-content" className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
        <aside className="hidden rounded-[2rem] border bg-card p-12 lg:block">
          <h1 className="flex flex-col items-start gap-4 text-[2.6rem] leading-[1.4] font-black tracking-tight text-school-navy xl:text-5xl xl:leading-[1.4]">
            <span>
              <Mark>시간표</Mark>부터
            </span>
            <span>
              <Mark>과제</Mark>까지,
            </span>
            <span>
              학교생활을 <Mark>하나로.</Mark>
            </span>
          </h1>
          <p className="mt-8 max-w-sm text-sm leading-7 text-muted-foreground">
            서로 다른 시간표로 시작해도, 수업과 과제, 학교 소식은 Cue에서 함께합니다.
          </p>
          <ul className="mt-10 flex flex-col gap-5">
            {[
              { icon: CalendarDays, title: "나에게 맞는 시간표", text: "참여한 수업으로 완성되는 나의 하루" },
              { icon: BookOpen, title: "수업과 과제", text: "과제 확인부터 제출 기록까지 한곳에서" },
              { icon: Megaphone, title: "놓치지 않는 공지", text: "선생님과 학생이 함께 확인하는 소식" },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-foreground">
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-school-navy">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>

      <footer className="border-t px-5 py-4 text-center text-[11px] text-muted-foreground">
        Cue · 학교생활 통합 포털
      </footer>
    </div>
  );
}
