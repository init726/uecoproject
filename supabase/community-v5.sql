-- =====================================================================
-- 커뮤니티 v5: 학생 글·댓글은 항상 "학번 이름" 실명으로 표시한다.
-- community-v4.sql 다음에 Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 한 번 실행한다.
-- 여러 번 실행해도 결과가 같다.
--
--   - 아이디와 상관없이, 글을 쓰는 순간의 profiles 학번·이름을 서버가 붙인다. (예: "20315 김나균")
--   - 교사·관리자는 이름만 쓴다. 역할 표시는 화면이 author_role 로 붙인다.
--   - 클라이언트가 보낸 author_name 은 무시된다. 수정은 guard_post_update 가 이미 막는다.
-- =====================================================================

-- 커뮤니티에 보일 작성자 이름. 학번이 없는 학생은 이름만 쓴다.
create or replace function public.community_author_name(p_user_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p.role = 'student' and nullif(btrim(coalesce(p.student_no, '')), '') is not null
      then btrim(p.student_no) || ' ' || p.name
    else p.name
  end
  from public.profiles p
  where p.id = p_user_id
$$;

-- prepare_post / prepare_comment(before_*_insert) 가 작성자를 확정한 뒤에 이름을 덮어쓴다.
-- 트리거는 이름 순서대로 실행되므로 before_*_insert_real_name 이 항상 뒤에 돈다.
create or replace function public.set_community_real_name()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.author_name := coalesce(public.community_author_name(new.author_id), new.author_name);
  return new;
end
$$;

revoke execute on function public.community_author_name(uuid) from public, anon, authenticated;
revoke execute on function public.set_community_real_name() from public, anon, authenticated;

drop trigger if exists before_post_insert_real_name on public.posts;
create trigger before_post_insert_real_name
  before insert on public.posts
  for each row execute function public.set_community_real_name();

drop trigger if exists before_comment_insert_real_name on public.comments;
create trigger before_comment_insert_real_name
  before insert on public.comments
  for each row execute function public.set_community_real_name();

-- 이미 쓴 학생 글·댓글도 같은 형식으로 맞춘다.
-- (SQL Editor 는 관리 권한으로 실행되므로 사용자용 수정 금지 트리거에 걸리지 않는다)
update public.posts t
set author_name = coalesce(public.community_author_name(t.author_id), t.author_name)
where t.author_role = 'student'
  and t.author_name is distinct from coalesce(public.community_author_name(t.author_id), t.author_name);

update public.comments t
set author_name = coalesce(public.community_author_name(t.author_id), t.author_name)
where t.author_role = 'student'
  and t.author_name is distinct from coalesce(public.community_author_name(t.author_id), t.author_name);
