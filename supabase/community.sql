-- =====================================================================
-- 커뮤니티 (학교 전체 게시판)
-- schema.sql 을 실행한 뒤, Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 한 번 실행한다.
--
-- 보안 원칙은 schema.sql 과 같다. 권한은 화면이 아니라 여기(RLS·트리거·함수)에서 막는다.
--   - 글/댓글 작성: 트리거가 작성자 이름·역할·상태를 서버에서 채운다. 클라이언트 값은 무시된다.
--   - 상태 변경(삭제·숨김·복구): 직접 UPDATE는 막고, 아래 함수(RPC)로만 할 수 있다.
--   - 숨김/삭제된 글·댓글은 RLS가 걸러내므로 직접 주소나 API로도 일반 사용자에게 나오지 않는다.
-- =====================================================================

create type public.post_kind as enum ('notice', 'question', 'free');
create type public.content_status as enum ('published', 'review', 'deleted');

-- 이용 정지 계정: 글·댓글·신고를 쓸 수 없다. 관리자가 set_user_suspended 로 바꾼다.
alter table public.profiles add column suspended boolean not null default false;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- 작성자 이름·역할은 글을 쓰는 순간의 값을 복사해 둔다. 학생끼리는 서로의 profiles를
-- 볼 수 없으므로 profiles를 열어 주는 대신 필요한 표시 정보만 글에 들고 있게 한다.
-- 학번은 저장하지 않는다.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null default '',
  author_role public.user_role not null default 'student',
  kind public.post_kind not null,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  pinned boolean not null default false,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not pinned or kind = 'notice')
);

-- 댓글은 한 단계만 있다. (대댓글 없음) 수정도 없고 삭제만 된다.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null default '',
  author_role public.user_role not null default 'student',
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  status public.content_status not null default 'published',
  created_at timestamptz not null default now()
);

-- 신고. 글 또는 댓글 중 하나만 대상으로 한다.
-- handled_at: 관리자가 복구·삭제하면 채워진다. 처리된 신고는 자동 숨김 횟수에 세지 않는다.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null,
  check ((post_id is null) <> (comment_id is null))
);

-- 같은 사람이 같은 대상을 두 번 신고할 수 없다. (처리가 끝난 뒤에도 마찬가지)
create unique index reports_one_per_post on public.reports (post_id, reporter_id) where post_id is not null;
create unique index reports_one_per_comment on public.reports (comment_id, reporter_id) where comment_id is not null;

-- 관리자 처리 이력. 고치거나 지우지 않고 쌓기만 한다. actor_id가 null이면 자동 숨김(시스템)이다.
-- 글이 지워져도 기록은 남도록 대상 id는 set null, 내용 앞부분은 target_excerpt에 복사해 둔다.
create table public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  post_id uuid references public.posts (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('auto_hide', 'hide', 'restore', 'delete')),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  target_excerpt text,
  created_at timestamptz not null default now()
);

create index on public.posts (status, pinned desc, created_at desc);
create index on public.posts (kind, created_at desc);
create index on public.posts (author_id);
create index on public.comments (post_id, created_at);
create index on public.comments (author_id);
create index on public.reports (post_id) where post_id is not null;
create index on public.reports (comment_id) where comment_id is not null;
create index on public.reports (handled_at);
create index on public.moderation_logs (created_at desc);

-- ---------------------------------------------------------------------
-- 2. 권한 확인 함수
-- ---------------------------------------------------------------------

-- 글·댓글·신고를 쓸 수 있는 사람: 정지되지 않은 학생, 승인된 교사, 관리자
create function public.can_use_community()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and not suspended and (role <> 'teacher' or approved)
  )
$$;

-- ---------------------------------------------------------------------
-- 3. 트리거
-- ---------------------------------------------------------------------

-- 글 작성 직전: 누가 쓸 수 있는지 검사하고, 작성자·상태·시각은 서버 값으로 덮어쓴다.
create function public.prepare_post()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles%rowtype;
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

create trigger before_post_insert
  before insert on public.posts
  for each row execute function public.prepare_post();

-- 글 수정 직전: 로그인한 사용자가 직접 고칠 수 있는 건 "게시 중인 내 글의 제목·본문"뿐이다.
-- 상태·고정·종류·작성자는 함수(RPC) 안에서만 바뀐다. (함수 안에서는 current_user가 함수 주인이다)
-- security definer를 쓰지 않아야 current_user가 호출한 사람의 역할로 보인다.
create function public.guard_post_update()
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

create trigger before_post_update
  before update on public.posts
  for each row execute function public.guard_post_update();

-- 댓글 작성 직전: 게시 중인 글에만 달 수 있다.
create function public.prepare_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles%rowtype;
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

  new.author_id := p.id;
  new.author_name := p.name;
  new.author_role := p.role;
  new.status := 'published';
  new.created_at := now();
  return new;
end
$$;

create trigger before_comment_insert
  before insert on public.comments
  for each row execute function public.prepare_comment();

-- ---------------------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------------------

-- 내 글 삭제. 실제로 지우지 않고 상태만 '삭제됨'으로 바꿔 신고 기록과 증거를 남긴다.
-- 검토 중인 글은 작성자가 지울 수 없다. (관리자가 판단할 때까지 보존)
create function public.delete_post(p_post_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.posts set status = 'deleted'
  where id = p_post_id and author_id = auth.uid() and status = 'published';
  if not found then
    raise exception '삭제할 수 없는 글입니다.';
  end if;
  update public.reports set handled_at = now() where post_id = p_post_id and handled_at is null;
end
$$;

create function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.comments set status = 'deleted'
  where id = p_comment_id and author_id = auth.uid() and status = 'published';
  if not found then
    raise exception '삭제할 수 없는 댓글입니다.';
  end if;
  update public.reports set handled_at = now() where comment_id = p_comment_id and handled_at is null;
end
$$;

-- 신고. 처리 전 신고가 서로 다른 사용자 3명 이상이면 자동으로 '검토 중'으로 숨긴다.
-- 영구 삭제는 하지 않는다. 글(댓글) 행을 잠가서 동시에 들어온 신고도 정확히 센다.
create function public.report_content(p_post_id uuid, p_comment_id uuid, p_reason text)
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

-- 관리자 처리: 숨김(hide) / 복구(restore) / 삭제(delete). 내용을 고치지는 않는다.
-- 처리한 사람·시각·사유가 moderation_logs 에 남는다. 복구·삭제하면 그 대상의 신고는 '처리됨'이 된다.
create function public.moderate_content(
  p_post_id uuid,
  p_comment_id uuid,
  p_action text,
  p_reason text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_status public.content_status;
  v_new public.content_status;
  v_excerpt text;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.';
  end if;
  if (p_post_id is null) = (p_comment_id is null) then
    raise exception '처리 대상이 올바르지 않습니다.';
  end if;
  if p_action not in ('hide', 'restore', 'delete') then
    raise exception '알 수 없는 처리입니다.';
  end if;
  if char_length(v_reason) = 0 then
    raise exception '처리 사유를 입력해 주세요.';
  end if;
  if char_length(v_reason) > 300 then
    raise exception '처리 사유는 300자까지 쓸 수 있습니다.';
  end if;

  if p_post_id is not null then
    select status, left(title, 50) into v_status, v_excerpt from public.posts where id = p_post_id for update;
  else
    select status, left(body, 50) into v_status, v_excerpt from public.comments where id = p_comment_id for update;
  end if;
  if not found then
    raise exception '대상을 찾을 수 없습니다.';
  end if;

  -- hide: 게시 중 -> 검토 중, restore: 검토 중 -> 게시 중, delete: 게시 중/검토 중 -> 삭제됨
  if p_action = 'hide' and v_status = 'published' then
    v_new := 'review';
  elsif p_action = 'restore' and v_status = 'review' then
    v_new := 'published';
  elsif p_action = 'delete' and v_status in ('published', 'review') then
    v_new := 'deleted';
  else
    raise exception '현재 상태에서는 할 수 없는 처리입니다.';
  end if;

  if p_post_id is not null then
    update public.posts set status = v_new where id = p_post_id;
  else
    update public.comments set status = v_new where id = p_comment_id;
  end if;

  if p_action in ('restore', 'delete') then
    update public.reports set handled_at = now(), handled_by = auth.uid()
    where handled_at is null
      and (case when p_post_id is not null then post_id = p_post_id else comment_id = p_comment_id end);
  end if;

  insert into public.moderation_logs (target_type, post_id, comment_id, actor_id, action, reason, target_excerpt)
  values (
    case when p_post_id is not null then 'post' else 'comment' end,
    p_post_id, p_comment_id, auth.uid(), p_action, v_reason, v_excerpt
  );
end
$$;

-- 공지 상단 고정/해제 (관리자, 게시 중인 공지만)
create function public.set_post_pinned(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.';
  end if;
  update public.posts set pinned = p_pinned
  where id = p_post_id and kind = 'notice' and status = 'published';
  if not found then
    raise exception '고정할 수 없는 글입니다.';
  end if;
end
$$;

-- 이용 정지/해제 (관리자). 관리자 계정은 정지할 수 없다.
create function public.set_user_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.';
  end if;
  update public.profiles set suspended = p_suspended where id = p_user_id and role <> 'admin';
  if not found then
    raise exception '정지할 수 없는 계정입니다.';
  end if;
end
$$;

revoke execute on function public.delete_post(uuid) from public, anon;
revoke execute on function public.delete_comment(uuid) from public, anon;
revoke execute on function public.report_content(uuid, uuid, text) from public, anon;
revoke execute on function public.moderate_content(uuid, uuid, text, text) from public, anon;
revoke execute on function public.set_post_pinned(uuid, boolean) from public, anon;
revoke execute on function public.set_user_suspended(uuid, boolean) from public, anon;
grant execute on function public.delete_post(uuid) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.report_content(uuid, uuid, text) to authenticated;
grant execute on function public.moderate_content(uuid, uuid, text, text) to authenticated;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;
grant execute on function public.set_user_suspended(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS 정책: 정책이 없는 동작은 전부 거부된다.
-- ---------------------------------------------------------------------

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_logs enable row level security;

revoke all on public.posts, public.comments, public.reports, public.moderation_logs from anon;
-- 직접 쓰기를 막아 둔 동작은 권한 자체도 회수한다. (정책이 실수로 열려도 한 번 더 막힌다)
revoke delete on public.posts from authenticated;
revoke update, delete on public.comments from authenticated;
revoke insert, update, delete on public.reports from authenticated;
revoke insert, update, delete on public.moderation_logs from authenticated;

-- 게시 중인 글은 로그인한 모두에게. 검토 중인 글은 관리자와 작성자 본인만. 삭제됨은 관리자만.
create policy "posts: 게시 중이거나 관리자·작성자만 조회" on public.posts
  for select to authenticated
  using (status = 'published' or public.is_admin() or (author_id = auth.uid() and status = 'review'));
create policy "posts: 본인 명의로만 작성" on public.posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "posts: 작성자만 수정" on public.posts
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- 댓글은 부모 글이 게시 중일 때만 보인다. (숨겨진 글의 댓글도 함께 가려진다)
create policy "comments: 게시 중인 글의 게시 중 댓글만 조회, 관리자는 전체" on public.comments
  for select to authenticated
  using (
    public.is_admin()
    or (
      exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
      and (status = 'published' or (author_id = auth.uid() and status = 'review'))
    )
  );
create policy "comments: 본인 명의로만 작성" on public.comments
  for insert to authenticated with check (author_id = auth.uid());

create policy "reports: 관리자와 신고자 본인만 조회" on public.reports
  for select to authenticated using (public.is_admin() or reporter_id = auth.uid());

create policy "moderation_logs: 관리자만 조회" on public.moderation_logs
  for select to authenticated using (public.is_admin());
