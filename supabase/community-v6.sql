-- =====================================================================
-- 커뮤니티 v6: 읽은 글 표시
-- community-v5.sql 다음에 Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 한 번 실행한다.
-- 여러 번 실행해도 결과가 같다.
--
--   - 글 화면을 열면 (나, 글) 한 줄이 남는다. 목록은 이 기록으로 "읽음"을 표시한다.
--   - 내 기록만 보고 남길 수 있다. 다른 사람이 무엇을 읽었는지는 아무도(관리자 포함) 볼 수 없다.
--   - 볼 수 없는 글(숨김·삭제)에는 기록을 남길 수 없다.
-- =====================================================================

create table if not exists public.post_reads (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.post_reads enable row level security;

drop policy if exists "post_reads: 내 기록만 조회" on public.post_reads;
create policy "post_reads: 내 기록만 조회" on public.post_reads
  for select to authenticated using (user_id = auth.uid());

-- 글이 보이는지는 posts 의 RLS 가 그대로 판단한다.
drop policy if exists "post_reads: 내 이름으로, 볼 수 있는 글만 기록" on public.post_reads;
create policy "post_reads: 내 이름으로, 볼 수 있는 글만 기록" on public.post_reads
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));

revoke all on public.post_reads from anon;
revoke update, delete on public.post_reads from authenticated;
grant select, insert on public.post_reads to authenticated;
