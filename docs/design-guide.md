# 우리학교 디자인 가이드

새 화면(커뮤니티 등)을 만들 때 이 규칙만 따르면 기존 화면과 같은 모양이 된다. 색과 공통 모양은 모두 [src/app/globals.css](../src/app/globals.css)에 있다.

## 1. 색: 이름으로만 쓴다

색 코드(`#0b0f14`, `bg-blue-600` 등)를 직접 쓰지 않는다. 아래 이름을 쓰면 나중에 색을 바꿔도 전체가 같이 바뀌고, **라이트·다크 모드가 자동으로 따라온다.**
값은 [src/app/globals.css](../src/app/globals.css) 의 `:root`(라이트)와 `.dark`(다크)에 있다.

| 쓰임 | 클래스 | 라이트 | 다크 |
| --- | --- | --- | --- |
| 주 색: 버튼, 링크, 강조 글자 | `bg-primary` `text-primary` | 검정 `#0b0f14` | 연두 `#c4f26d` |
| 주 색 위의 글자 | `text-primary-foreground` | 흰색 | 검정 |
| 페이지·패널 제목 | `text-school-navy` | 검정 | 밝은 회백색 |
| 본문 글자 | `text-foreground` (기본값) | 검정 | 밝은 회백색 |
| 보조 글자 (날짜, 설명) | `text-muted-foreground` | `#5a6169` | `#98a2ad` |
| 화면 바탕 | `bg-background` (기본값) | 오프화이트 `#f5f5f1` | 거의 검정 `#0b0f14` |
| 카드·패널 바탕 | `bg-card` | 흰색 | `#141a21` |
| 강조 바탕 (선택됨, 지금 보는 메뉴) | `bg-accent` `text-accent-foreground` | 형광 연두 `#c4f26d` | 어두운 올리브 + 연두 글자 |
| 연한 회색 바탕 (입력칸 등) | `bg-muted` | `#eeeee8` | `#1a2129` |
| 테두리 | `border` (색은 자동) | `#e1e1da` | `#252e38` |
| 삭제·오류 | `text-destructive`, `<Button variant="destructive">` | 빨강 | 밝은 빨강 |
| 작은 포인트 선·점 | `bg-school-gold` | 연두 | 연두 |

- **글자가 "검정 위에 연두"인 곳**(예: 로그인 화면의 형광 연두 하이라이트)처럼 모드와 상관없이 같은 색이어야 하는 곳만 `bg-school-gold text-black` 을 쓴다.
- 경고(주황, `amber-*`)는 "시간 겹침" 같은 경고 상자에만 쓴다. 시간표 칸의 파스텔 색(`timetable.tsx`)은 아직 라이트 전용 고정 색이다.
- 커뮤니티 말머리 색(`bg-kind-notice-soft` 등 9개)도 같은 방식으로 라이트·다크 값이 따로 있다.

### 라이트·다크 모드

- **기본은 라이트.** OS 설정(다크)은 따르지 않고, 사용자가 위쪽 바의 해·달 버튼(`<ThemeToggle />`)으로 바꾼다. 고른 모드는 쿠키 `theme` 에 1년 저장되고 서버가 처음부터 그 모드로 그려서 깜빡이지 않는다.
- 모드는 `<html class="dark">` 로 정해진다. 새 화면에서는 `dark:` 를 따로 쓸 일이 거의 없다. 위 이름(토큰)만 쓰면 된다.
- 새로 색이 필요하면 `globals.css` 의 `:root` 와 `.dark` **양쪽에** 변수를 추가하고 `@theme inline` 에 이름을 붙인다.

## 2. 공통 모양 클래스

| 클래스 | 쓰는 곳 |
| --- | --- |
| `page-title` | 페이지 맨 위 큰 제목 (`<h2>`) |
| `eyebrow` | 제목 위의 작은 안내 글 |
| `school-panel` | 내용 덩어리를 감싸는 흰 상자 |
| `school-panel-heading` | 패널 윗줄 (제목 + 오른쪽 버튼) |
| `school-panel-title` | 패널 제목 (`<h3>`) |
| `surface` | 테두리 있는 흰 카드 (작은 상자) |
| `form-select` | `<select>` 드롭다운 |

## 3. 페이지 기본 틀

새 페이지는 이 모양을 그대로 복사해서 시작한다.

```tsx
export default async function CommunityPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="border-b pb-6">
        <p className="eyebrow">학교 커뮤니티</p>
        <h2 className="page-title">자유게시판</h2>
        <p className="mt-2 text-sm text-muted-foreground">학생과 선생님이 함께 쓰는 게시판입니다.</p>
      </div>

      <section className="school-panel">
        <div className="school-panel-heading">
          <h3 className="school-panel-title">최근 글</h3>
          <Button asChild size="sm"><Link href="/community/new">글쓰기</Link></Button>
        </div>
        <div className="divide-y">{/* 목록 */}</div>
      </section>
    </div>
  );
}
```

- 간격은 `gap-6`(덩어리 사이), `gap-3`(목록 사이), 패널 안쪽 여백 `px-4 py-4 sm:px-5`로 맞춘다.
- 내용이 없을 때는 패널 안에 짧은 안내문을 보여준다: 굵은 한 줄(`text-sm font-medium`) + 설명(`text-xs text-muted-foreground`).

## 4. 부품

- **버튼·입력칸·표·탭·배지**는 `src/components/ui/`의 것을 쓴다. 직접 `<button className=...>`을 만들지 않는다.
  - 기본: `<Button>` / 덜 중요한 것: `variant="outline"` / 글자만: `variant="ghost"` / 삭제: `variant="destructive"`
  - 서버 액션 폼의 버튼은 `src/components/submit-button.tsx`의 `<SubmitButton pendingText="저장 중...">`을 쓴다. 누르는 즉시 "처리 중"으로 바뀐다.
- **아이콘**은 `lucide-react`만 쓰고, 패널 제목 옆에 작게(`size-4`~`size-[18px]`, `text-primary`) 둔다. 위쪽 바에는 아이콘을 넣지 않는다.
- **날짜·시간**은 `src/lib/format.ts`의 `formatDateTime()`으로 보여준다. (항상 한국 시간)
- 이모지는 쓰지 않는다.

## 5. 메뉴에 커뮤니티 추가하기

메뉴는 `src/components/shells/`에 계정 종류별로 있다. 각 파일에 한 줄씩만 추가한다.

- 학생: `student-shell.tsx`의 `NAV` 배열에 `{ href: "/community", label: "커뮤니티", icon: MessageSquare }` 추가 (위쪽 바와 휴대폰 아래 탭에 같이 나온다. 아래 탭이 4칸이 되므로 `<nav className="school-bottom-nav md:hidden">`에 `grid-cols-4`를 덧붙인다)
- 교사: `teacher-shell.tsx`의 사이드바에 `<NavLink href="/community" className={ITEM}>`, 휴대폰 아래 탭에도 같은 링크
- 관리자: `admin-shell.tsx`의 `NAV` 배열에 한 줄

지금 보는 메뉴 표시(연두 알약)는 `NavLink`가 알아서 해 준다.

## 6. 하지 말 것

- 색 코드 직접 쓰기, 새 색 추가하기 (필요하면 팀장과 상의해서 `globals.css`에 이름을 붙여 추가)
- 그림자(`shadow-lg` 등), 그라데이션 — 지금 디자인은 테두리와 큰 둥근 모서리로 구분하는 평평한 스타일이다
- 글자 크기 마음대로 정하기 — 제목은 `page-title`, `school-panel-title`, 본문은 `text-sm`, 보조는 `text-xs`
- 흐린 글자를 더 흐리게 만들기 (`text-muted-foreground/50` 등) — 글자가 안 읽힌다
