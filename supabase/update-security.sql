-- =====================================================================
-- 보안 업데이트 (2026-10-27)
--   1. Supabase 공개 가입 API로 만든 계정 차단: 학교 서버가 넣은 발급 허가표가 있어야 계정이 된다.
--   2. 커뮤니티 글·댓글은 승인된(정지되지 않은) 사용자만 읽는다. 승인 전 교사 가입 계정은 읽을 수 없다.
-- 기존 프로젝트: community-v6.sql 까지 적용한 뒤 SQL Editor 에서 이 파일 전체를 한 번 실행한다. (다시 실행해도 안전하다)
-- 신규 프로젝트: schema.sql / community.sql 에 같은 내용이 들어 있으므로 따로 실행하지 않는다.
-- 앱을 먼저 배포한 뒤 실행한다. (예전 앱은 허가표를 넣지 않아 계정 발급이 막힌다)
-- =====================================================================
begin;

-- 계정 발급 허가표. 학교 서버가 관리자 키(service_role)로 계정을 만들기 직전에 이메일을 넣어 두고,
-- 가입 트리거가 확인한 뒤 지운다. 허가표가 없는 가입(Supabase 공개 가입 API 등)은 거부된다.
-- 로그인한 사용자·비로그인 사용자는 이 표를 전혀 읽거나 쓸 수 없다.
create table if not exists public.account_issue_tickets (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.account_issue_tickets enable row level security;
revoke all on public.account_issue_tickets from anon, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then
  grant all on public.account_issue_tickets to service_role;
end if; end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.user_role :=
    case when new.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher' else 'student' end;
begin
  -- 학교 서버가 넣어 둔 발급 허가표(10분 유효)가 있어야 계정이 된다. 쓴 허가표는 지운다.
  delete from public.account_issue_tickets
  where lower(email) = lower(new.email) and created_at > now() - interval '10 minutes';
  if not found then
    raise exception '학교에서 발급한 계정만 만들 수 있습니다.';
  end if;

  if coalesce(new.raw_user_meta_data ->> 'privacy_agreed', '') <> 'true' then
    raise exception '개인정보 수집에 동의해야 가입할 수 있습니다.';
  end if;

  insert into public.profiles (id, name, role, student_no, subject, approved, privacy_agreed_at)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    v_role,
    case when v_role = 'student' then nullif(btrim(new.raw_user_meta_data ->> 'student_no'), '') end,
    case when v_role = 'teacher' then nullif(btrim(new.raw_user_meta_data ->> 'subject'), '') end,
    v_role = 'student',
    now()
  );
  return new;
end
$$;

drop policy if exists "posts: 게시 중이거나 관리자·작성자만 조회" on public.posts;
create policy "posts: 게시 중이거나 관리자·작성자만 조회" on public.posts
  for select to authenticated
  using (
    public.is_admin()
    or (public.can_use_community() and (status = 'published' or (author_id = auth.uid() and status = 'review')))
  );

drop policy if exists "comments: 게시 중인 글의 게시 중 댓글만 조회, 관리자는 전체" on public.comments;
create policy "comments: 게시 중인 글의 게시 중 댓글만 조회, 관리자는 전체" on public.comments
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.can_use_community()
      and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
      and (status = 'published' or (author_id = auth.uid() and status = 'review'))
    )
  );

commit;
