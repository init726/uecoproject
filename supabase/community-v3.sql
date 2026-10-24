-- =====================================================================
-- 커뮤니티 3차: 답변 채택(질문 해결됨) + 댓글 수정 + 스크랩
-- community-v2.sql 을 실행한 뒤, Supabase SQL Editor 에서 이 파일 전체를 한 번 실행한다.
-- (새로 만드는 곳은 schema.sql -> community.sql -> community-v2.sql -> community-v3.sql 순서)
--
--   - 채택: 질문 글쓴이만 다른 사람의 댓글 하나를 채택한다. 채택된 글은 '해결됨'이고 채택된 댓글 작성자에게 알림이 간다.
--           채택은 함수(accept_comment)로만 바뀌고, 채택된 댓글이 삭제·숨김되면 자동으로 풀린다.
--   - 댓글 수정: 본인 댓글을 게시 중일 때만 고칠 수 있다. 함수(update_comment)로만 가능하다.
--   - 스크랩: 사용자별로 글을 저장해 둔다. 본인 것만 보고 고치며 200개까지.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 답변 채택
-- ---------------------------------------------------------------------

alter table public.posts
  add column accepted_comment_id uuid references public.comments (id) on delete set null;
-- 채택은 질문 글에서만 있다.
alter table public.posts
  add constraint posts_accepted_only_for_question check (accepted_comment_id is null or kind = 'question');
create index on public.posts (kind, accepted_comment_id);

-- 직접 UPDATE 로는 채택을 바꿀 수 없다. (guard_post_update 에 한 줄만 더했다)
create or replace function public.guard_post_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.author_id is distinct from old.author_id
       or new.author_name is distinct from old.author_name
       or new.author_role is distinct from old.author_role
       or new.kind is distinct from old.kind
       or new.pinned is distinct from old.pinned
       or new.status is distinct from old.status
       or new.accepted_comment_id is distinct from old.accepted_comment_id
       or new.created_at is distinct from old.created_at then
      raise exception '제목과 내용만 수정할 수 있습니다.';
    end if;
    if old.status <> 'published' then
      raise exception '수정할 수 없는 글입니다.';
    end if;
    if not public.can_use_community() then
      raise exception '이용이 정지된 계정은 글을 수정할 수 없습니다.';
    end if;
    new.updated_at := now();
  end if;
  return new;
end
$$;

-- 알림 종류에 '채택'을 더한다.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('comment', 'hidden', 'restored', 'deleted', 'accepted'));

-- 댓글 채택/채택 취소. p_comment_id 가 null 이면 채택을 푼다.
-- 이미 채택된 글에서 다른 댓글을 고르면 채택이 바뀐다.
create function public.accept_comment(p_post_id uuid, p_comment_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_comment public.comments%rowtype;
begin
  if not public.can_use_community() then
    raise exception '채택할 수 없는 계정입니다.';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.author_id <> auth.uid() then
    raise exception '글쓴이만 채택할 수 있습니다.';
  end if;
  if v_post.kind <> 'question' then
    raise exception '질문 글에서만 채택할 수 있습니다.';
  end if;
  if v_post.status <> 'published' then
    raise exception '게시 중인 글에서만 채택할 수 있습니다.';
  end if;

  if p_comment_id is null then
    update public.posts set accepted_comment_id = null where id = p_post_id;
    return;
  end if;

  select * into v_comment from public.comments where id = p_comment_id and post_id = p_post_id;
  if not found or v_comment.status <> 'published' then
    raise exception '채택할 수 없는 댓글입니다.';
  end if;
  if v_comment.author_id = auth.uid() then
    raise exception '내 댓글은 채택할 수 없습니다.';
  end if;

  update public.posts set accepted_comment_id = p_comment_id where id = p_post_id;

  -- 이미 채택돼 있던 댓글을 다시 누른 경우에는 알림을 또 보내지 않는다.
  if v_post.accepted_comment_id is distinct from p_comment_id then
    insert into public.notifications (user_id, kind, target_type, post_id, comment_id, actor_name, excerpt)
    values (v_comment.author_id, 'accepted', 'comment', p_post_id, p_comment_id, v_post.author_name, left(v_post.title, 50));
  end if;
end
$$;

-- 채택된 댓글이 삭제·숨김되면 채택을 푼다. (복구돼도 다시 채택되지는 않는다)
create function public.clear_accepted_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'published' and new.status <> 'published' then
    update public.posts set accepted_comment_id = null where accepted_comment_id = new.id;
  end if;
  return null;
end
$$;

create trigger after_comment_unpublish
  after update of status on public.comments
  for each row execute function public.clear_accepted_comment();

-- ---------------------------------------------------------------------
-- 2. 댓글 수정
-- ---------------------------------------------------------------------

-- 기존 댓글은 수정된 적이 없으므로 작성 시각으로 채운다. ('수정됨' 표시가 잘못 붙지 않게)
alter table public.comments add column updated_at timestamptz;
update public.comments set updated_at = created_at;
alter table public.comments
  alter column updated_at set not null,
  alter column updated_at set default now();

create function public.update_comment(p_comment_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_comment public.comments%rowtype;
begin
  if not public.can_use_community() then
    raise exception '이용이 정지된 계정은 댓글을 수정할 수 없습니다.';
  end if;
  if char_length(v_body) = 0 then
    raise exception '댓글을 입력해 주세요.';
  end if;
  if char_length(v_body) > 1000 then
    raise exception '댓글은 1000자까지 쓸 수 있습니다.';
  end if;

  select * into v_comment
  from public.comments
  where id = p_comment_id and author_id = auth.uid() and status = 'published'
  for update;
  if not found
     or not exists (select 1 from public.posts where id = v_comment.post_id and status = 'published') then
    raise exception '수정할 수 없는 댓글입니다.';
  end if;

  if v_body <> v_comment.body then
    update public.comments set body = v_body, updated_at = now() where id = p_comment_id;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 3. 스크랩
-- ---------------------------------------------------------------------

create table public.bookmarks (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index on public.bookmarks (user_id, created_at desc);

-- 한 사람이 쌓아 둘 수 있는 스크랩은 200개까지.
create function public.limit_bookmarks()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.bookmarks where user_id = new.user_id) >= 200 then
    raise exception '스크랩은 200개까지 할 수 있습니다. 보지 않는 글은 해제해 주세요.';
  end if;
  return new;
end
$$;

create trigger before_bookmark_insert
  before insert on public.bookmarks
  for each row execute function public.limit_bookmarks();

alter table public.bookmarks enable row level security;
revoke all on public.bookmarks from anon;
revoke update on public.bookmarks from authenticated;

create policy "bookmarks: 내 스크랩만 조회" on public.bookmarks
  for select to authenticated using (user_id = auth.uid());
-- 내가 볼 수 있는(게시 중인) 글만 스크랩할 수 있다. posts 의 RLS 가 그대로 적용된다.
create policy "bookmarks: 내 이름으로, 볼 수 있는 글만 스크랩" on public.bookmarks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
  );
create policy "bookmarks: 내 스크랩만 해제" on public.bookmarks
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------

revoke execute on function public.accept_comment(uuid, uuid) from public, anon;
revoke execute on function public.update_comment(uuid, text) from public, anon;
grant execute on function public.accept_comment(uuid, uuid) to authenticated;
grant execute on function public.update_comment(uuid, text) to authenticated;
