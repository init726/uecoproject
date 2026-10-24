-- =====================================================================
-- 커뮤니티 2차: 알림 + 도배 방지
-- community.sql 을 실행한 뒤, Supabase SQL Editor 에서 이 파일 전체를 한 번 실행한다.
-- (새로 만드는 곳은 schema.sql -> community.sql -> community-v2.sql 순서)
--
--   - 알림: 내 글에 댓글이 달렸을 때, 내 글·댓글이 숨겨지거나 복구·삭제됐을 때 알림 한 줄이 쌓인다.
--           알림은 트리거만 만들 수 있고, 사용자는 자기 알림을 읽고 '읽음'으로만 바꿀 수 있다.
--   - 도배 방지: 글·댓글·신고를 짧은 시간에 반복해서 올리는 것을 DB에서 막는다. 관리자는 글 제한이 없다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 알림
-- ---------------------------------------------------------------------

-- 글/댓글의 대상 내용은 알림이 만들어지는 순간의 앞부분(excerpt)을 복사해 둔다.
-- (삭제되어 더는 볼 수 없는 글이어도 무엇에 대한 알림인지 알 수 있게)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('comment', 'hidden', 'restored', 'deleted')),
  target_type text not null default 'post' check (target_type in ('post', 'comment')),
  post_id uuid not null references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete set null,
  actor_name text,
  excerpt text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
-- 만들기·고치기·지우기는 트리거와 함수만 한다.
revoke insert, update, delete on public.notifications from authenticated;

create policy "notifications: 내 알림만 조회" on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- 내 글에 다른 사람이 댓글을 달면 글쓴이에게 알린다. (내가 내 글에 단 댓글은 알리지 않는다)
create function public.notify_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
begin
  select * into v_post from public.posts where id = new.post_id;
  if found and v_post.author_id <> new.author_id then
    insert into public.notifications (user_id, kind, target_type, post_id, comment_id, actor_name, excerpt)
    values (v_post.author_id, 'comment', 'post', new.post_id, new.id, new.author_name, left(v_post.title, 50));
  end if;
  return null;
end
$$;

create trigger after_comment_insert
  after insert on public.comments
  for each row execute function public.notify_comment();

-- 내 글이 숨겨지거나(신고 3회·관리자) 복구·삭제되면 글쓴이에게 알린다.
-- 내가 직접 지운 경우는 알리지 않는다. 신고 누적 숨김은 신고한 사람이 호출자이므로 알림이 간다.
create function public.notify_post_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text;
begin
  if new.status = old.status or auth.uid() = new.author_id then
    return null;
  end if;
  v_kind := case
    when new.status = 'review' then 'hidden'
    when new.status = 'published' and old.status = 'review' then 'restored'
    when new.status = 'deleted' then 'deleted'
  end;
  if v_kind is not null then
    insert into public.notifications (user_id, kind, target_type, post_id, excerpt)
    values (new.author_id, v_kind, 'post', new.id, left(new.title, 50));
  end if;
  return null;
end
$$;

create trigger after_post_status_change
  after update of status on public.posts
  for each row execute function public.notify_post_status();

create function public.notify_comment_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text;
begin
  if new.status = old.status or auth.uid() = new.author_id then
    return null;
  end if;
  v_kind := case
    when new.status = 'review' then 'hidden'
    when new.status = 'published' and old.status = 'review' then 'restored'
    when new.status = 'deleted' then 'deleted'
  end;
  if v_kind is not null then
    insert into public.notifications (user_id, kind, target_type, post_id, comment_id, excerpt)
    values (new.author_id, v_kind, 'comment', new.post_id, new.id, left(new.body, 50));
  end if;
  return null;
end
$$;

create trigger after_comment_status_change
  after update of status on public.comments
  for each row execute function public.notify_comment_status();

-- 읽음 처리 (내 알림만)
create function public.mark_notification_read(p_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.notifications set read_at = now()
  where id = p_id and user_id = auth.uid() and read_at is null
$$;

create function public.mark_all_notifications_read()
returns void
language sql security definer set search_path = ''
as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null
$$;

revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------
-- 2. 도배 방지
--   글:   10분에 3개까지, 연달아 10초 안에 또 쓸 수 없고, 1시간 안에 같은 제목·내용은 안 된다.
--   댓글: 2분에 8개까지, 같은 글에 1분 안에 같은 내용은 안 된다.
--   신고: 1시간에 10건까지.
-- 삭제한 글·댓글도 횟수에 센다. (지우고 다시 올리는 방식으로 우회하지 못하게)
-- 관리자의 글은 제한하지 않는다.
-- ---------------------------------------------------------------------

create or replace function public.prepare_post()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  v_count integer;
  v_oldest timestamptz;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception '로그인이 필요합니다.';
  end if;
  if p.suspended then
    raise exception '이용이 정지된 계정은 글을 쓸 수 없습니다.';
  end if;
  if p.role = 'teacher' and not p.approved then
    raise exception '승인 전에는 글을 쓸 수 없습니다.';
  end if;

  -- 학교 공지는 관리자만, 관리자는 공지만 쓴다. 질문·자유글은 학생과 승인된 교사.
  if new.kind = 'notice' and p.role <> 'admin' then
    raise exception '학교 공지는 관리자만 쓸 수 있습니다.';
  end if;
  if new.kind <> 'notice' and p.role = 'admin' then
    raise exception '관리자는 학교 공지만 쓸 수 있습니다.';
  end if;

  if p.role <> 'admin' then
    if exists (
      select 1 from public.posts
      where author_id = p.id and created_at > now() - interval '10 seconds'
    ) then
      raise exception '글을 너무 빨리 올리고 있습니다. 잠시 후 다시 시도해 주세요.';
    end if;

    select count(*), min(created_at) into v_count, v_oldest
    from public.posts
    where author_id = p.id and created_at > now() - interval '10 minutes';
    if v_count >= 3 then
      raise exception '글은 10분에 3개까지 올릴 수 있습니다. %분 뒤에 다시 시도해 주세요.',
        greatest(1, ceil(extract(epoch from (v_oldest + interval '10 minutes' - now())) / 60)::integer);
    end if;

    if exists (
      select 1 from public.posts
      where author_id = p.id and created_at > now() - interval '1 hour'
        and title = new.title and body = new.body
    ) then
      raise exception '같은 내용의 글을 방금 올렸습니다.';
    end if;
  end if;

  new.author_id := p.id;
  new.author_name := p.name;
  new.author_role := p.role;
  new.status := 'published';
  new.pinned := new.pinned and new.kind = 'notice';
  new.created_at := now();
  new.updated_at := now();
  return new;
end
$$;

create or replace function public.prepare_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  v_count integer;
  v_oldest timestamptz;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception '로그인이 필요합니다.';
  end if;
  if p.suspended then
    raise exception '이용이 정지된 계정은 댓글을 쓸 수 없습니다.';
  end if;
  if p.role = 'teacher' and not p.approved then
    raise exception '승인 전에는 댓글을 쓸 수 없습니다.';
  end if;
  if not exists (select 1 from public.posts where id = new.post_id and status = 'published') then
    raise exception '댓글을 달 수 없는 글입니다.';
  end if;

  select count(*), min(created_at) into v_count, v_oldest
  from public.comments
  where author_id = p.id and created_at > now() - interval '2 minutes';
  if v_count >= 8 then
    raise exception '댓글은 2분에 8개까지 달 수 있습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  if exists (
    select 1 from public.comments
    where author_id = p.id and post_id = new.post_id
      and created_at > now() - interval '1 minute' and body = new.body
  ) then
    raise exception '같은 댓글을 방금 달았습니다.';
  end if;

  new.author_id := p.id;
  new.author_name := p.name;
  new.author_role := p.role;
  new.status := 'published';
  new.created_at := now();
  return new;
end
$$;

-- 신고: community.sql 의 함수에 "1시간에 10건까지" 검사만 더했다.
create or replace function public.report_content(p_post_id uuid, p_comment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_author uuid;
  v_status public.content_status;
  v_count integer;
  v_excerpt text;
begin
  if not public.can_use_community() then
    raise exception '신고할 수 없는 계정입니다.';
  end if;
  if (p_post_id is null) = (p_comment_id is null) then
    raise exception '신고 대상이 올바르지 않습니다.';
  end if;
  if char_length(v_reason) = 0 then
    raise exception '신고 사유를 입력해 주세요.';
  end if;
  if char_length(v_reason) > 300 then
    raise exception '신고 사유는 300자까지 쓸 수 있습니다.';
  end if;

  select count(*) into v_count
  from public.reports
  where reporter_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_count >= 10 then
    raise exception '신고는 1시간에 10건까지 할 수 있습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  if p_post_id is not null then
    select author_id, status, left(title, 50) into v_author, v_status, v_excerpt
    from public.posts where id = p_post_id for update;
  else
    -- 부모 글이 숨겨져 있으면 그 댓글도 보이지 않으므로 신고 대상이 아니다.
    select c.author_id, c.status, left(c.body, 50) into v_author, v_status, v_excerpt
    from public.comments c
    join public.posts p on p.id = c.post_id and p.status = 'published'
    where c.id = p_comment_id for update of c;
  end if;

  if not found or v_status <> 'published' then
    raise exception '신고할 수 없는 대상입니다.';
  end if;
  if v_author = auth.uid() then
    raise exception '내 글과 댓글은 신고할 수 없습니다.';
  end if;

  begin
    insert into public.reports (post_id, comment_id, reporter_id, reason)
    values (p_post_id, p_comment_id, auth.uid(), v_reason);
  exception when unique_violation then
    raise exception '이미 신고했습니다.';
  end;

  select count(distinct reporter_id) into v_count
  from public.reports
  where handled_at is null
    and (case when p_post_id is not null then post_id = p_post_id else comment_id = p_comment_id end);

  if v_count >= 3 then
    if p_post_id is not null then
      update public.posts set status = 'review' where id = p_post_id;
    else
      update public.comments set status = 'review' where id = p_comment_id;
    end if;
    insert into public.moderation_logs (target_type, post_id, comment_id, actor_id, action, reason, target_excerpt)
    values (
      case when p_post_id is not null then 'post' else 'comment' end,
      p_post_id, p_comment_id, null, 'auto_hide', '서로 다른 사용자 3명 이상이 신고해 자동으로 숨김', v_excerpt
    );
  end if;
end
$$;
