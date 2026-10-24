-- =====================================================================
-- 커뮤니티 3차: 금칙어
-- community-v2.sql 을 실행한 뒤, Supabase SQL Editor 에서 이 파일 전체를 한 번 실행한다.
-- (새로 만드는 곳은 schema.sql -> community.sql -> community-v2.sql -> community-v3.sql 순서)
--
-- 금칙어는 banned_words 테이블에 두고 관리자만 보고 고친다. 글·댓글을 올리거나 글을 고칠 때 DB 트리거가 검사한다.
--   action = 'block'  : 올릴 수 없다. (이유는 알려 주지만 어떤 단어인지는 알려 주지 않는다)
--   action = 'review' : 올라가지만 '검토 중'으로 숨겨지고 관리자 검토 대상이 된다. 처리 이력에 자동 숨김으로 남는다.
--   match_type = 'contains' : 공백·기호·숫자를 지운 글에 단어가 들어 있으면 걸린다. (예: "씨 1 발" -> "씨발")
--   match_type = 'whole'    : 띄어 쓴 낱말이 단어와 똑같을 때만 걸린다. (예: "시발점" 같은 정상 낱말이 걸리지 않게)
-- 관리자의 글·댓글은 검사하지 않는다. 이미 올라온 글은 소급해서 검사하지 않는다.
-- =====================================================================

create table public.banned_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique check (char_length(word) between 1 and 50),
  match_type text not null default 'contains' check (match_type in ('contains', 'whole')),
  action text not null default 'block' check (action in ('block', 'review')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid()
);

-- 비교용으로 글을 다듬는다: 소문자로 바꾸고 한글(자모 포함)과 영문자만 남긴다.
create function public.normalize_text(p_text text)
returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_text, '')), '[^가-힣ㄱ-ㅎㅏ-ㅣa-z]', '', 'g')
$$;

-- 금칙어는 저장할 때 같은 방식으로 다듬어 둔다. (관리자가 "씨 발"이라고 적어도 "씨발"로 저장)
create function public.prepare_banned_word()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.word := public.normalize_text(new.word);
  if new.word = '' then
    raise exception '금칙어에는 한글이나 영문자가 있어야 합니다.';
  end if;
  return new;
end
$$;

create trigger before_banned_word_write
  before insert or update of word on public.banned_words
  for each row execute function public.prepare_banned_word();

-- 글에 걸리는 금칙어가 있으면 가장 강한 처리('block' > 'review')를, 없으면 null 을 돌려준다.
create function public.check_banned_words(p_text text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_norm text := public.normalize_text(p_text);
  v_tokens text[] := string_to_array(
    btrim(regexp_replace(lower(coalesce(p_text, '')), '[^가-힣ㄱ-ㅎㅏ-ㅣa-z]+', ' ', 'g')), ' ');
  v_action text;
begin
  select w.action into v_action
  from public.banned_words w
  where (w.match_type = 'contains' and position(w.word in v_norm) > 0)
     or (w.match_type = 'whole' and w.word = any (v_tokens))
  order by (w.action = 'block') desc
  limit 1;
  return v_action;
end
$$;

-- 금칙어 목록은 관리자만 보고 고친다. 일반 사용자는 목록을 볼 수 없다.
alter table public.banned_words enable row level security;
revoke all on public.banned_words from anon;
create policy "banned_words: 관리자만" on public.banned_words
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke execute on function public.check_banned_words(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 글·댓글에 검사 끼우기 (v2 의 함수에 금칙어 검사만 더했다)
-- ---------------------------------------------------------------------

create or replace function public.prepare_post()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  v_count integer;
  v_oldest timestamptz;
  v_banned text;
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

    v_banned := public.check_banned_words(new.title || ' ' || new.body);
    if v_banned = 'block' then
      raise exception '부적절한 표현이 포함되어 있어 올릴 수 없습니다. 내용을 고쳐 주세요.';
    end if;
  end if;

  new.author_id := p.id;
  new.author_name := p.name;
  new.author_role := p.role;
  -- 'review' 단어가 있으면 올라가되 숨겨진 상태로 시작한다.
  new.status := case when v_banned = 'review' then 'review'::public.content_status else 'published' end;
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
  v_banned text;
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

  select count(*) into v_count
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

  if p.role <> 'admin' then
    v_banned := public.check_banned_words(new.body);
    if v_banned = 'block' then
      raise exception '부적절한 표현이 포함되어 있어 올릴 수 없습니다. 내용을 고쳐 주세요.';
    end if;
  end if;

  new.author_id := p.id;
  new.author_name := p.name;
  new.author_role := p.role;
  new.status := case when v_banned = 'review' then 'review'::public.content_status else 'published' end;
  new.created_at := now();
  return new;
end
$$;

-- 글 수정: 제목·본문을 고칠 때도 검사한다. 'block' 이면 고칠 수 없고, 'review' 면 검토 중으로 바뀐다.
-- guard_post_update(호출한 사용자 권한으로 실행)와 분리한 이유: 금칙어 검사 함수는 사용자가 직접 부를 수 없게
-- 잠가 두었기 때문에, 검사는 권한이 있는(security definer) 별도 트리거가 맡는다.
-- 트리거 이름 순서상 before_post_update(상태·작성자 변경 차단)가 먼저 돈다.
create function public.check_post_banned_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_banned text;
begin
  if old.status = 'published'
     and (new.title is distinct from old.title or new.body is distinct from old.body)
     and not public.is_admin() then
    v_banned := public.check_banned_words(new.title || ' ' || new.body);
    if v_banned = 'block' then
      raise exception '부적절한 표현이 포함되어 있어 수정할 수 없습니다. 내용을 고쳐 주세요.';
    elsif v_banned = 'review' then
      new.status := 'review';
    end if;
  end if;
  return new;
end
$$;

create trigger before_post_update_banned
  before update on public.posts
  for each row execute function public.check_post_banned_update();

-- 금칙어('review')로 숨겨진 글·댓글은 처리 이력에 남기고, 글쓴이에게 알린다.
-- 신고 누적 숨김과 구별되도록 사유를 따로 적는다. (글을 고쳐서 걸린 경우는 이력만 남긴다)
create function public.log_banned_post()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'review'
     and (tg_op = 'INSERT' or (old.status = 'published' and (new.title is distinct from old.title or new.body is distinct from old.body))) then
    insert into public.moderation_logs (target_type, post_id, actor_id, action, reason, target_excerpt)
    values ('post', new.id, null, 'auto_hide', '금칙어가 포함되어 자동으로 숨김 (관리자 검토 대기)', left(new.title, 50));
    if tg_op = 'INSERT' then
      insert into public.notifications (user_id, kind, target_type, post_id, excerpt)
      values (new.author_id, 'hidden', 'post', new.id, left(new.title, 50));
    end if;
  end if;
  return null;
end
$$;

create trigger after_post_banned_review
  after insert or update of title, body on public.posts
  for each row execute function public.log_banned_post();

create function public.log_banned_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'review' then
    insert into public.moderation_logs (target_type, post_id, comment_id, actor_id, action, reason, target_excerpt)
    values ('comment', new.post_id, new.id, null, 'auto_hide', '금칙어가 포함되어 자동으로 숨김 (관리자 검토 대기)', left(new.body, 50));
    insert into public.notifications (user_id, kind, target_type, post_id, comment_id, excerpt)
    values (new.author_id, 'hidden', 'comment', new.post_id, new.id, left(new.body, 50));
  end if;
  return null;
end
$$;

create trigger after_comment_banned_review
  after insert on public.comments
  for each row execute function public.log_banned_comment();

-- 검토 중으로 시작한 댓글은 글쓴이에게 "댓글이 달렸다"고 알리지 않는다. (아직 아무도 볼 수 없으므로)
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
  if found and v_post.author_id <> new.author_id then
    insert into public.notifications (user_id, kind, target_type, post_id, comment_id, actor_name, excerpt)
    values (v_post.author_id, 'comment', 'post', new.post_id, new.id, new.author_name, left(v_post.title, 50));
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------
-- 시작용 금칙어. 학교 사정에 맞게 관리자가 추가·삭제한다.
-- 흔한 낱말과 겹칠 수 있는 것(시발점, 개나리 등)은 'whole'로 넣어 오탐을 줄였다.
-- 확실히 심한 말은 막고(block), 거친 표현은 숨겨서 사람이 보게(review) 했다.
-- ---------------------------------------------------------------------
insert into public.banned_words (word, match_type, action) values
  ('씨발', 'contains', 'block'),
  ('씨팔', 'contains', 'block'),
  ('시발', 'whole', 'block'),
  ('ㅅㅂ', 'whole', 'block'),
  ('ㅆㅂ', 'whole', 'block'),
  ('개새끼', 'contains', 'block'),
  ('병신', 'contains', 'block'),
  ('ㅂㅅ', 'whole', 'block'),
  ('좆', 'whole', 'block'),
  ('지랄', 'whole', 'block'),
  ('미친놈', 'contains', 'block'),
  ('미친년', 'contains', 'block'),
  ('느금마', 'contains', 'block'),
  ('섹스', 'whole', 'review'),
  ('미친', 'whole', 'review'),
  ('꺼져', 'whole', 'review'),
  ('닥쳐', 'whole', 'review'),
  ('쓰레기', 'whole', 'review'),
  ('한심', 'whole', 'review')
on conflict (word) do nothing;
