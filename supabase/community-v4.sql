-- =====================================================================
-- 커뮤니티 4차: 댓글 단 글의 새 댓글 알림 + 정렬용 댓글 수·마지막 활동 시각
-- community-v3.sql 을 실행한 뒤, Supabase SQL Editor 에서 이 파일 전체를 한 번 실행한다.
-- (새로 만드는 곳은 schema.sql -> community.sql -> community-v2.sql -> community-v3.sql -> community-v4.sql 순서)
--
--   - 알림: 내 글뿐 아니라 "내가 이미 댓글을 단 글"에 다른 사람이 새 댓글을 달아도 알려 준다.
--           같은 글에 대해 안 읽은 알림이 이미 있으면 새로 쌓지 않는다. (알림함이 도배되지 않게)
--   - 정렬: posts.comment_count(게시 중인 댓글 수)와 posts.last_activity_at(마지막 댓글 시각, 없으면 작성 시각)을
--           트리거가 항상 맞춰 둔다. 목록에서 댓글 많은 순·최근 댓글순으로 정렬할 때 쓴다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 댓글 수 · 마지막 활동 시각
-- ---------------------------------------------------------------------

alter table public.posts
  add column comment_count integer not null default 0,
  add column last_activity_at timestamptz;

-- 이미 있는 글을 채운다.
update public.posts p
set comment_count = (
      select count(*) from public.comments c where c.post_id = p.id and c.status = 'published'
    ),
    last_activity_at = greatest(
      p.created_at,
      coalesce((select max(c.created_at) from public.comments c where c.post_id = p.id and c.status = 'published'), p.created_at)
    );

alter table public.posts
  alter column last_activity_at set not null,
  alter column last_activity_at set default now();

create index on public.posts (status, pinned desc, comment_count desc, created_at desc);
create index on public.posts (status, pinned desc, last_activity_at desc);

-- 댓글이 달리거나(insert) 게시 상태가 바뀌거나(update of status) 지워지면(delete) 그 글의 값을 다시 계산한다.
-- (security definer 라서 아래 guard_post_update 의 "직접 수정 금지"에 걸리지 않는다)
create function public.refresh_post_comment_stats()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_post uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
begin
  update public.posts p
  set comment_count = (
        select count(*) from public.comments c where c.post_id = p.id and c.status = 'published'
      ),
      last_activity_at = greatest(
        p.created_at,
        coalesce((select max(c.created_at) from public.comments c where c.post_id = p.id and c.status = 'published'), p.created_at)
      )
  where p.id = v_post;
  return null;
end
$$;

create trigger after_comment_stats
  after insert or delete or update of status on public.comments
  for each row execute function public.refresh_post_comment_stats();

-- 사용자는 이 두 값을 직접 바꿀 수 없다. (v3 의 guard_post_update 에 두 줄만 더했다)
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
       or new.comment_count is distinct from old.comment_count
       or new.last_activity_at is distinct from old.last_activity_at
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

-- ---------------------------------------------------------------------
-- 2. 댓글 단 글의 새 댓글 알림
-- ---------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('comment', 'hidden', 'restored', 'deleted', 'accepted', 'reply'));

-- v2/v3 의 notify_comment 에 "이미 댓글을 단 다른 사람들에게도 알리기"를 더했다.
--   comment : 내 글에 댓글이 달렸다 (글쓴이에게)
--   reply   : 내가 댓글을 단 글에 새 댓글이 달렸다 (글쓴이가 아닌 이전 댓글 작성자에게)
-- 새 댓글을 단 본인은 알리지 않는다. 글쓴이는 위의 'comment' 로 이미 알리므로 'reply' 는 보내지 않는다.
-- 지워지거나 숨겨진 댓글만 남은 사람에게는 보내지 않는다.
create or replace function public.notify_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
begin
  if new.status <> 'published' then
    return null;
  end if;
  select * into v_post from public.posts where id = new.post_id;
  if not found then
    return null;
  end if;

  if v_post.author_id <> new.author_id then
    insert into public.notifications (user_id, kind, target_type, post_id, comment_id, actor_name, excerpt)
    values (v_post.author_id, 'comment', 'post', new.post_id, new.id, new.author_name, left(v_post.title, 50));
  end if;

  insert into public.notifications (user_id, kind, target_type, post_id, comment_id, actor_name, excerpt)
  select distinct c.author_id, 'reply', 'post', new.post_id, new.id, new.author_name, left(v_post.title, 50)
  from public.comments c
  where c.post_id = new.post_id
    and c.status = 'published'
    and c.author_id not in (new.author_id, v_post.author_id)
    -- 이 글에 대해 아직 안 읽은 'reply' 알림이 있으면 또 쌓지 않는다.
    and not exists (
      select 1 from public.notifications n
      where n.user_id = c.author_id and n.post_id = new.post_id and n.kind = 'reply' and n.read_at is null
    );
  return null;
end
$$;
