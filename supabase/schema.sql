-- =====================================================================
-- Cue (신정고등학교) 데이터베이스
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 한 번 실행한다.
--
-- 보안 원칙: "누가 무엇을 볼 수 있는지"는 화면이 아니라 여기(RLS)에서 막는다.
-- 화면 코드에 실수가 있어도 다른 학생의 제출물은 데이터베이스가 내주지 않는다.
-- =====================================================================

create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.assignment_type as enum ('file', 'text');

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- 사용자 정보. 로그인 계정(auth.users)이 생기면 트리거가 자동으로 한 줄 만든다.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role public.user_role not null default 'student',
  student_no text,
  subject text,
  -- 학생은 바로 true, 교사는 관리자가 승인해야 true
  approved boolean not null default false,
  privacy_agreed_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 초대코드: 헷갈리는 글자(0, O, 1, I)를 뺀 32글자 중 6자리.
-- gen_random_uuid()의 앞 6바이트는 암호학적으로 안전한 난수다.
create function public.generate_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(s.b, i) % 32 + 1, 1), '')
  from (select uuid_send(gen_random_uuid()) as b) s, generate_series(0, 5) as i
$$;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id),
  name text not null check (char_length(name) between 1 and 50),
  semester text not null check (char_length(semester) between 1 and 30),
  room text check (char_length(room) <= 30),
  invite_code text not null unique default public.generate_invite_code(),
  created_at timestamptz not null default now()
);

-- 클래스의 요일·교시. day: 1=월 ~ 5=금, period: 1~7교시
create table public.class_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  day smallint not null check (day between 1 and 5),
  period smallint not null check (period between 1 and 7),
  unique (class_id, day, period)
);

create table public.enrollments (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) <= 5000),
  created_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 5000),
  rubric text not null default '' check (char_length(rubric) <= 5000),
  due_at timestamptz not null,
  type public.assignment_type not null,
  -- 글 과제의 글자 수 제한 (파일 과제는 null)
  max_chars integer check (max_chars between 50 and 10000),
  allow_late boolean not null default true,
  created_at timestamptz not null default now(),
  check (type = 'text' or max_chars is null)
);

-- 제출물은 고치거나 지우지 않고, 다시 낼 때마다 version을 올려 새 줄로 쌓는다. (SEC-06)
-- submitted_at, is_late, version은 트리거가 서버 시각으로 채우므로 학생이 조작할 수 없다.
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id),
  student_id uuid not null references public.profiles (id),
  version integer not null,
  file_path text,
  file_name text check (char_length(file_name) <= 200),
  file_size integer,
  content text,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  unique (assignment_id, student_id, version)
);

create index on public.class_slots (class_id);
create index on public.enrollments (student_id);
create index on public.notices (class_id, created_at desc);
create index on public.assignments (class_id, due_at);
create index on public.submissions (assignment_id, student_id, version desc);

-- ---------------------------------------------------------------------
-- 2. 권한 확인 함수
-- security definer: RLS 정책 안에서 다른 테이블을 확인할 때 무한 반복을 막는다.
-- ---------------------------------------------------------------------

create function public.my_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create function public.is_approved_teacher()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'teacher' and approved
  )
$$;

create function public.is_class_teacher(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.classes where id = p_class_id and teacher_id = auth.uid())
$$;

create function public.is_class_member(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments where class_id = p_class_id and student_id = auth.uid()
  )
$$;

create function public.can_view_class(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_class_teacher(p_class_id) or public.is_class_member(p_class_id)
$$;

create function public.is_assignment_teacher(p_assignment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id = p_assignment_id and c.teacher_id = auth.uid()
  )
$$;

create function public.is_assignment_member(p_assignment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
    join public.enrollments e on e.class_id = a.class_id
    where a.id = p_assignment_id and e.student_id = auth.uid()
  )
$$;

-- 내 정보, 내 수업의 학생, 내가 듣는 수업의 선생님만 볼 수 있다. 관리자는 전체.
create function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.enrollments e
      join public.classes c on c.id = e.class_id
      where (c.teacher_id = auth.uid() and e.student_id = p_profile_id)
         or (c.teacher_id = p_profile_id and e.student_id = auth.uid())
    )
$$;

-- ---------------------------------------------------------------------
-- 3. 트리거
-- ---------------------------------------------------------------------

-- 회원가입 시 profiles 자동 생성. 가입 화면에서 보낸 role은 student/teacher만 허용한다.
-- (누가 role=admin을 보내도 student가 된다. 관리자는 SQL로만 지정한다.)
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.user_role :=
    case when new.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher' else 'student' end;
begin
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 제출 직전에 서버가 검사하고 값을 채운다. 학생이 보낸 시각·지각 여부·버전은 무시된다.
create function public.prepare_submission()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  a public.assignments%rowtype;
  v_size bigint;
begin
  select * into a from public.assignments where id = new.assignment_id;
  if not found then
    raise exception '과제를 찾을 수 없습니다.';
  end if;

  new.student_id := auth.uid();
  new.submitted_at := now();
  new.is_late := now() > a.due_at;

  if new.is_late and not a.allow_late then
    raise exception '마감이 지나 제출할 수 없습니다.';
  end if;

  if a.type = 'file' then
    if new.file_path is null or new.content is not null then
      raise exception '파일을 올려야 하는 과제입니다.';
    end if;
    -- 경로는 반드시 "과제id/내id/파일" 이어야 한다.
    if split_part(new.file_path, '/', 1) <> a.id::text
       or split_part(new.file_path, '/', 2) <> auth.uid()::text then
      raise exception '잘못된 파일 경로입니다.';
    end if;
    -- 실제로 업로드된 파일인지, 크기는 얼마인지 저장소에서 직접 확인한다.
    select (o.metadata ->> 'size')::bigint into v_size
    from storage.objects o
    where o.bucket_id = 'submissions' and o.name = new.file_path;
    if not found then
      raise exception '업로드된 파일을 찾을 수 없습니다.';
    end if;
    new.file_size := v_size;
  else
    if new.content is null or new.file_path is not null then
      raise exception '글을 작성해야 하는 과제입니다.';
    end if;
    if char_length(btrim(new.content)) = 0 then
      raise exception '내용을 입력해 주세요.';
    end if;
    if a.max_chars is not null and char_length(new.content) > a.max_chars then
      raise exception '글자 수 제한(%자)을 넘었습니다.', a.max_chars;
    end if;
  end if;

  select coalesce(max(s.version), 0) + 1 into new.version
  from public.submissions s
  where s.assignment_id = new.assignment_id and s.student_id = new.student_id;

  return new;
end
$$;

create trigger before_submission_insert
  before insert on public.submissions
  for each row execute function public.prepare_submission();

-- ---------------------------------------------------------------------
-- 4. RPC (화면에서 supabase.rpc('이름')으로 부르는 함수)
-- ---------------------------------------------------------------------

-- 초대코드로 클래스 참여. 학생은 참여 전에는 클래스를 볼 수 없으므로 함수로 처리한다.
-- 이미 듣는 수업과 요일·교시가 겹치면 conflicts에 담아 돌려준다. (막지는 않고 경고만)
create function public.join_class(p_code text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_class_id uuid;
  v_conflicts text[];
begin
  if public.my_role() is distinct from 'student' then
    raise exception '학생만 클래스에 참여할 수 있습니다.';
  end if;

  select id into v_class_id from public.classes where invite_code = upper(btrim(p_code));
  if not found then
    raise exception '초대코드를 다시 확인해 주세요.';
  end if;

  select array_agg(distinct c.name || ' (' || (array['월', '화', '수', '목', '금'])[s.day] || ' ' || s.period || '교시)')
  into v_conflicts
  from public.class_slots s
  join public.class_slots mine on mine.day = s.day and mine.period = s.period
  join public.enrollments e on e.class_id = mine.class_id and e.student_id = auth.uid()
  join public.classes c on c.id = mine.class_id
  where s.class_id = v_class_id and mine.class_id <> v_class_id;

  insert into public.enrollments (class_id, student_id)
  values (v_class_id, auth.uid())
  on conflict do nothing;

  return json_build_object('class_id', v_class_id, 'conflicts', coalesce(v_conflicts, '{}'));
end
$$;

-- 관리자의 교사 승인/거절. 거절하면 그 가입 계정을 삭제한다.
create function public.set_teacher_approval(p_user_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.';
  end if;

  if p_approve then
    update public.profiles set approved = true where id = p_user_id and role = 'teacher';
  else
    delete from auth.users u
    where u.id = p_user_id
      and exists (
        select 1 from public.profiles p
        where p.id = p_user_id and p.role = 'teacher' and not p.approved
      );
  end if;
end
$$;

revoke execute on function public.join_class(text) from public, anon;
revoke execute on function public.set_teacher_approval(uuid, boolean) from public, anon;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.set_teacher_approval(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS 정책: 정책이 없는 동작(예: 제출물 수정·삭제)은 전부 거부된다.
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_slots enable row level security;
alter table public.enrollments enable row level security;
alter table public.notices enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

-- 로그인하지 않은 사용자는 어떤 테이블도 직접 읽거나 쓸 수 없다.
revoke all on all tables in schema public from anon;

create policy "profiles: 볼 수 있는 사람만 조회" on public.profiles
  for select to authenticated using (public.can_view_profile(id));

-- teacher_id를 직접 비교해야 insert 직후 결과를 돌려받을 때(insert ... select)도 통과한다.
create policy "classes: 담당 교사와 참여 학생만 조회" on public.classes
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_class_member(id));
create policy "classes: 승인된 교사만 생성" on public.classes
  for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_approved_teacher());
create policy "classes: 담당 교사만 수정" on public.classes
  for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "class_slots: 클래스를 볼 수 있으면 조회" on public.class_slots
  for select to authenticated using (public.can_view_class(class_id));
create policy "class_slots: 담당 교사만 추가" on public.class_slots
  for insert to authenticated with check (public.is_class_teacher(class_id));
create policy "class_slots: 담당 교사만 삭제" on public.class_slots
  for delete to authenticated using (public.is_class_teacher(class_id));

-- 참여(insert)는 join_class 함수로만 한다.
create policy "enrollments: 본인과 담당 교사만 조회" on public.enrollments
  for select to authenticated
  using (student_id = auth.uid() or public.is_class_teacher(class_id));
create policy "enrollments: 본인 나가기, 교사 내보내기" on public.enrollments
  for delete to authenticated
  using (student_id = auth.uid() or public.is_class_teacher(class_id));

create policy "notices: 클래스를 볼 수 있으면 조회" on public.notices
  for select to authenticated using (public.can_view_class(class_id));
create policy "notices: 담당 교사만 작성" on public.notices
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_class_teacher(class_id));
create policy "notices: 담당 교사만 삭제" on public.notices
  for delete to authenticated using (public.is_class_teacher(class_id));

create policy "assignments: 클래스를 볼 수 있으면 조회" on public.assignments
  for select to authenticated using (public.can_view_class(class_id));
create policy "assignments: 담당 교사만 생성" on public.assignments
  for insert to authenticated with check (public.is_class_teacher(class_id));
create policy "assignments: 담당 교사만 수정" on public.assignments
  for update to authenticated
  using (public.is_class_teacher(class_id)) with check (public.is_class_teacher(class_id));

-- 관리자도 제출물은 볼 수 없다. 본인과 담당 교사만.
create policy "submissions: 본인과 담당 교사만 조회" on public.submissions
  for select to authenticated
  using (student_id = auth.uid() or public.is_assignment_teacher(assignment_id));
create policy "submissions: 참여 학생만 제출" on public.submissions
  for insert to authenticated
  with check (student_id = auth.uid() and public.is_assignment_member(assignment_id));

-- ---------------------------------------------------------------------
-- 6. 파일 저장소: 비공개 버킷, 파일당 10MB
-- 경로 규칙: submissions/{과제id}/{학생id}/{시각}.{확장자}
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 10485760)
on conflict (id) do nothing;

create policy "submissions 버킷: 참여 학생이 자기 폴더에만 업로드" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
    and lower(storage.extension(name)) in ('pdf', 'hwp', 'hwpx', 'docx', 'jpg', 'jpeg', 'png', 'zip')
    and public.is_assignment_member(((storage.foldername(name))[1])::uuid)
  );

create policy "submissions 버킷: 본인과 담당 교사만 읽기" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_assignment_teacher(((storage.foldername(name))[1])::uuid)
    )
  );

-- 기존 프로젝트: SQL Editor에서 이 파일 전체를 한 번 실행한다.
-- 신규 프로젝트: schema.sql에 동일 내용이 포함되어 있으므로 별도 실행하지 않는다.
begin;

create table if not exists public.semesters (
  id text primary key check (char_length(id) between 1 and 30),
  academic_year integer,
  term smallint check (term in (1, 2)),
  unique (academic_year, term),
  check ((academic_year is null) = (term is null))
);

-- 표준 학기 목록을 만들고 기존 학기 표기를 정규화한다.
insert into public.semesters (id, academic_year, term)
select y || '-' || t || '학기', y, t
from generate_series(
  extract(year from now() at time zone 'Asia/Seoul')::integer - 2,
  extract(year from now() at time zone 'Asia/Seoul')::integer + 2
) y cross join generate_series(1, 2) t on conflict do nothing;
-- 인식 가능한 기존 표기(2026-2, 2026년 2학기 등)는 같은 학기로 합친다.
with parsed as (
  select regexp_match(semester, '^\s*([0-9]{4})\s*(?:학년도|년|-)\s*([12])\s*(?:학기)?\s*$') as m
  from public.classes
)
insert into public.semesters(id, academic_year, term)
select distinct m[1] || '-' || m[2] || '학기', m[1]::integer, m[2]::smallint
from parsed where m is not null on conflict do nothing;
with parsed as (
  select id, regexp_match(semester, '^\s*([0-9]{4})\s*(?:학년도|년|-)\s*([12])\s*(?:학기)?\s*$') as m
  from public.classes
)
update public.classes c set semester = p.m[1] || '-' || p.m[2] || '학기'
from parsed p where c.id = p.id and p.m is not null;
-- 그 밖의 자유 입력 학기는 별도 항목으로 보존한다.
insert into public.semesters (id)
select distinct semester from public.classes on conflict (id) do nothing;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.classes'::regclass and conname='classes_semester_fkey') then
    alter table public.classes add constraint classes_semester_fkey foreign key (semester) references public.semesters(id);
  end if;
end $$;
alter table public.semesters enable row level security;
revoke all on public.semesters from anon;
grant select on public.semesters to authenticated;
drop policy if exists "semesters: 로그인 사용자 조회" on public.semesters;
create policy "semesters: 로그인 사용자 조회" on public.semesters
  for select to authenticated using (true);

-- 생성/수정과 시간표 교체는 한 트랜잭션. 충돌 확인 응답일 때는 아무것도 쓰지 않는다.
create or replace function public.save_class(
  p_name text, p_semester text, p_room text, p_slots jsonb,
  p_class_id uuid default null, p_allow_conflicts boolean default false
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_conflicts text[];
begin
  if not public.is_approved_teacher() then
    raise exception '승인된 교사만 클래스를 저장할 수 있습니다.';
  end if;
  -- 같은 교사의 동시 생성/수정 요청이 서로 충돌을 놓치지 않게 직렬화한다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  if p_class_id is not null and not public.is_class_teacher(p_class_id) then
    raise exception '본인 클래스만 수정할 수 있습니다.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 50
     or char_length(coalesce(p_room, '')) > 30 then
    raise exception '과목명과 강의실을 확인해 주세요.';
  end if;
  if not exists (select 1 from public.semesters where id = p_semester) then
    raise exception '학기를 다시 선택해 주세요.';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception '수업 시간을 선택해 주세요.';
  end if;
  if jsonb_array_length(p_slots) not between 1 and 35 then
    raise exception '수업 시간을 1개 이상 선택해 주세요.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots) as s(day integer, period integer)
    where day is null or period is null or day not between 1 and 5 or period not between 1 and 7
  ) then
    raise exception '잘못된 수업 시간입니다.';
  end if;

  select array_agg(distinct c.name || ' (' || (array['월','화','수','목','금'])[s.day] || ' ' || s.period || '교시)')
  into v_conflicts
  from public.classes c join public.class_slots s on s.class_id = c.id
  join jsonb_to_recordset(p_slots) as requested(day integer, period integer)
    on requested.day = s.day and requested.period = s.period
  where c.teacher_id = auth.uid() and c.semester = p_semester
    and (p_class_id is null or c.id <> p_class_id);
  if v_conflicts is not null and not coalesce(p_allow_conflicts, false) then
    return jsonb_build_object('class_id', null, 'conflicts', v_conflicts);
  end if;

  if p_class_id is null then
    insert into public.classes (teacher_id, name, semester, room)
    values (auth.uid(), btrim(p_name), p_semester, nullif(btrim(p_room), '')) returning id into v_id;
  else
    v_id := p_class_id;
    update public.classes set name = btrim(p_name), semester = p_semester,
      room = nullif(btrim(p_room), '') where id = v_id;
    delete from public.class_slots where class_id = v_id;
  end if;
  insert into public.class_slots (class_id, day, period)
  select distinct v_id, day, period from jsonb_to_recordset(p_slots) as s(day integer, period integer);
  return jsonb_build_object('class_id', v_id, 'conflicts', coalesce(v_conflicts, '{}'));
end
$$;
revoke execute on function public.save_class(text, text, text, jsonb, uuid, boolean) from public, anon;
grant execute on function public.save_class(text, text, text, jsonb, uuid, boolean) to authenticated;

-- 다른 학기의 클래스는 시간 충돌로 세지 않는다.
create or replace function public.join_class(p_code text)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  v_class_id uuid;
  v_semester text;
  v_conflicts text[];
begin
  if public.my_role() is distinct from 'student' then
    raise exception '학생만 클래스에 참여할 수 있습니다.';
  end if;
  select id, semester into v_class_id, v_semester
  from public.classes where invite_code = upper(btrim(p_code));
  if not found then raise exception '초대코드를 다시 확인해 주세요.'; end if;
  select array_agg(distinct c.name || ' (' || (array['월','화','수','목','금'])[s.day] || ' ' || s.period || '교시)')
  into v_conflicts
  from public.class_slots s
  join public.class_slots mine on mine.day = s.day and mine.period = s.period
  join public.enrollments e on e.class_id = mine.class_id and e.student_id = auth.uid()
  join public.classes c on c.id = mine.class_id
  where s.class_id = v_class_id and mine.class_id <> v_class_id and c.semester = v_semester;
  insert into public.enrollments (class_id, student_id) values (v_class_id, auth.uid()) on conflict do nothing;
  return json_build_object('class_id', v_class_id, 'conflicts', coalesce(v_conflicts, '{}'));
end
$$;
commit;

-- 20261024_semester_timetable.sql 적용 후 실행. 재실행 가능.
begin;
alter table public.classes add column if not exists import_key text;
create unique index if not exists classes_import_key_idx on public.classes(import_key) where import_key is not null;

create or replace function public.protect_class_import_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op='INSERT' then
      if new.import_key is not null then raise exception '학교 배정 표시는 관리자만 설정할 수 있습니다.'; end if;
    elsif new.import_key is distinct from old.import_key then
      raise exception '학교 배정 표시는 관리자만 변경할 수 있습니다.';
    end if;
  end if;
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid='public.classes'::regclass and tgname='protect_import_key') then
    create trigger protect_import_key before insert or update on public.classes for each row execute function public.protect_class_import_key();
  end if;
end $$;

create or replace function public.import_school_timetable(p_semester text, p_classes jsonb, p_enrollments jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  e record;
  v_id uuid;
  v_teacher uuid;
  v_existing integer;
  v_created integer := 0;
  v_reused integer := 0;
  v_added integer := 0;
  v_rows integer;
  v_ids jsonb := '{}';
  v_slots jsonb;
  v_existing_slots jsonb;
  v_key text;
begin
  if not public.is_admin() then raise exception '관리자만 시간표를 가져올 수 있습니다.'; end if;
  if p_semester is null or not exists(select 1 from public.semesters where id=p_semester) then
    raise exception '등록된 학기를 선택해 주세요.';
  end if;
  if p_classes is null or jsonb_typeof(p_classes) <> 'array' or p_enrollments is null or jsonb_typeof(p_enrollments) <> 'array' then
    raise exception '잘못된 가져오기 자료입니다.';
  end if;
  if jsonb_array_length(p_classes) not between 1 and 300 or jsonb_array_length(p_enrollments) not between 1 and 15000 then
    raise exception '가져오기 자료의 수량을 확인해 주세요.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('school-timetable-import',0));
  if exists(select name from jsonb_to_recordset(p_classes) as x(name text) group by name having count(*)>1) then
    raise exception '중복된 클래스명이 있습니다.';
  end if;
  if exists(select student_id, class_name from jsonb_to_recordset(p_enrollments) as x(student_id uuid,class_name text)
    group by student_id,class_name having count(*)>1) then raise exception '중복된 수강 신청이 있습니다.'; end if;

  -- 교사 화면의 save_class와 같은 잠금을 사용한다. 교사 UUID 순서로 잠가 교착을 피한다.
  for v_teacher in select distinct teacher_id from jsonb_to_recordset(p_classes) as x(teacher_id uuid) order by teacher_id loop
    if not exists(select 1 from public.profiles where id=v_teacher and role='teacher' and approved) then
      raise exception '담당 교사 계정과 승인 상태를 확인해 주세요.';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_teacher::text,0));
  end loop;

  for c in select * from jsonb_to_recordset(p_classes) as x(name text,teacher_id uuid,room text,slots jsonb,capacity integer) loop
    if c.name is null or char_length(btrim(c.name)) not between 1 and 50 or char_length(coalesce(c.room,''))>30
      or c.capacity is null or c.capacity not between 1 and 1000 then raise exception '클래스 정보를 확인해 주세요.'; end if;
    if c.slots is null or jsonb_typeof(c.slots)<>'array' then raise exception '수업 시간이 필요합니다.'; end if;
    if jsonb_array_length(c.slots) not between 1 and 35 or exists(
      select 1 from jsonb_to_recordset(c.slots) as s(day integer,period integer)
      where day is null or period is null or day not between 1 and 5 or period not between 1 and 7
    ) then raise exception '잘못된 수업 시간입니다.'; end if;
    select jsonb_agg(jsonb_build_object('day',day,'period',period) order by day,period) into v_slots
    from (select distinct day,period from jsonb_to_recordset(c.slots) as s(day integer,period integer)) s;
    if jsonb_array_length(v_slots)<>jsonb_array_length(c.slots) then raise exception '수업 시간이 중복됩니다.'; end if;
    v_key := p_semester || ':' || c.name;
    select count(*) into v_existing from public.classes
      where import_key=v_key or (import_key is null and semester=p_semester and name=c.name and teacher_id=c.teacher_id);
    if v_existing>1 then raise exception '같은 이름의 기존 클래스가 여러 개입니다: %', c.name; end if;
    v_id := null;
    if v_existing=1 then
      select id into v_id from public.classes
        where import_key=v_key or (import_key is null and semester=p_semester and name=c.name and teacher_id=c.teacher_id);
      select jsonb_agg(jsonb_build_object('day',day,'period',period) order by day,period) into v_existing_slots
        from public.class_slots where class_id=v_id;
      if not exists(select 1 from public.classes where id=v_id and teacher_id=c.teacher_id and semester=p_semester
          and name=c.name and coalesce(room,'')=coalesce(c.room,'')) or v_existing_slots is distinct from v_slots then
        raise exception '기존 클래스의 교사·시간·강의실이 엑셀과 다릅니다: %. 기존 수업을 확인한 뒤 다시 가져오세요.', c.name;
      end if;
      v_reused:=v_reused+1;
    end if;
    if exists(
      select 1 from public.classes other join public.class_slots s on s.class_id=other.id
      join jsonb_to_recordset(c.slots) as wanted(day integer,period integer) on wanted.day=s.day and wanted.period=s.period
      where other.semester=p_semester and (v_id is null or other.id<>v_id)
        and (other.teacher_id=c.teacher_id or (nullif(c.room,'') is not null and other.room=c.room))
    ) then raise exception '기존 수업과 교사 또는 강의실 시간이 겹칩니다: %',c.name; end if;
    if v_id is null then
      insert into public.classes(teacher_id,name,semester,room,import_key)
        values(c.teacher_id,c.name,p_semester,nullif(c.room,''),v_key) returning id into v_id;
      insert into public.class_slots(class_id,day,period)
        select v_id,day,period from jsonb_to_recordset(c.slots) as s(day integer,period integer);
      v_created:=v_created+1;
    else
      update public.classes set import_key=v_key where id=v_id;
    end if;
    v_ids:=jsonb_set(v_ids,array[c.name],to_jsonb(v_id));
  end loop;

  for e in select * from jsonb_to_recordset(p_enrollments) as x(student_id uuid,class_name text) loop
    if not exists(select 1 from public.profiles where id=e.student_id and role='student') then
      raise exception '학생 계정을 확인해 주세요.';
    end if;
    v_id := (v_ids->>e.class_name)::uuid;
    if v_id is null then raise exception '수강 신청의 클래스가 없습니다: %',e.class_name; end if;
    if exists(
      select 1 from public.enrollments mine
      join public.classes other on other.id=mine.class_id
      join public.class_slots s on s.class_id=other.id
      join public.class_slots wanted on wanted.class_id=v_id and wanted.day=s.day and wanted.period=s.period
      where mine.student_id=e.student_id and other.semester=p_semester and other.id<>v_id
    ) then raise exception '학생의 기존 수업과 시간이 겹칩니다: %',e.class_name; end if;
    insert into public.enrollments(class_id,student_id) values(v_id,e.student_id) on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_added:=v_added+v_rows;
  end loop;
  for c in select * from jsonb_to_recordset(p_classes) as x(name text,capacity integer) loop
    if (select count(*) from public.enrollments where class_id=(v_ids->>c.name)::uuid)>c.capacity then
      raise exception '기존 학생을 포함한 수강 인원이 정원을 넘습니다: %',c.name;
    end if;
  end loop;
  return jsonb_build_object('classes_created',v_created,'classes_reused',v_reused,'enrollments_added',v_added);
end
$$;
revoke execute on function public.import_school_timetable(text,jsonb,jsonb) from public,anon;
grant execute on function public.import_school_timetable(text,jsonb,jsonb) to authenticated;
commit;

-- =====================================================================
-- 20261025_submission_log_self_review.sql (제출 취소 기록 · 과제 몰림 확인 · 자기평가서 AI 초안)
-- =====================================================================

-- 제출 취소 기록 · 과제 몰림 확인 · 자기평가서 AI 초안
-- 기존 프로젝트: SQL Editor에서 이 파일 전체를 한 번 실행한다. (다시 실행해도 안전하다)
-- 신규 프로젝트: schema.sql 끝에 같은 내용이 들어 있으므로 따로 실행하지 않는다.
begin;

-- ---------------------------------------------------------------------
-- 1. 제출 취소: 제출 기록은 지우지 않고 "취소한 시각"만 남긴다.
--    최신 제출이 취소된 상태면 미제출로 본다. 다시 내면 새 버전이 쌓인다.
-- ---------------------------------------------------------------------
alter table public.submissions add column if not exists canceled_at timestamptz;

-- 제출할 때 학생이 canceled_at을 보내도 무시한다. (나머지는 기존 트리거와 같다)
create or replace function public.prepare_submission()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  a public.assignments%rowtype;
  v_size bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.assignment_id::text || ':' || auth.uid()::text, 0));
  select * into a from public.assignments where id = new.assignment_id;
  if not found then
    raise exception '과제를 찾을 수 없습니다.';
  end if;

  new.student_id := auth.uid();
  new.submitted_at := now();
  new.is_late := now() > a.due_at;
  new.canceled_at := null;

  if new.is_late and not a.allow_late then
    raise exception '마감이 지나 제출할 수 없습니다.';
  end if;

  if a.type = 'file' then
    if new.file_path is null or new.content is not null then
      raise exception '파일을 올려야 하는 과제입니다.';
    end if;
    if split_part(new.file_path, '/', 1) <> a.id::text
       or split_part(new.file_path, '/', 2) <> auth.uid()::text then
      raise exception '잘못된 파일 경로입니다.';
    end if;
    select (o.metadata ->> 'size')::bigint into v_size
    from storage.objects o
    where o.bucket_id = 'submissions' and o.name = new.file_path;
    if not found then
      raise exception '업로드된 파일을 찾을 수 없습니다.';
    end if;
    new.file_size := v_size;
  else
    if new.content is null or new.file_path is not null then
      raise exception '글을 작성해야 하는 과제입니다.';
    end if;
    if char_length(btrim(new.content)) = 0 then
      raise exception '내용을 입력해 주세요.';
    end if;
    if a.max_chars is not null and char_length(new.content) > a.max_chars then
      raise exception '글자 수 제한(%자)을 넘었습니다.', a.max_chars;
    end if;
  end if;

  select coalesce(max(s.version), 0) + 1 into new.version
  from public.submissions s
  where s.assignment_id = new.assignment_id and s.student_id = new.student_id;

  return new;
end
$$;

-- 학생이 자기 최신 제출을 취소한다. 마감이 지나면 취소할 수 없다. (제출물 표에는 수정 권한이 없어 이 함수로만 가능)
create or replace function public.cancel_submission(p_assignment_id uuid)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_due timestamptz;
  v_id uuid;
  v_version integer;
  v_canceled timestamptz;
begin
  if not public.is_assignment_member(p_assignment_id) then
    raise exception '과제를 찾을 수 없습니다.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_assignment_id::text || ':' || auth.uid()::text, 0));
  select due_at into v_due from public.assignments where id = p_assignment_id;
  if now() > v_due then
    raise exception '마감이 지난 과제는 제출을 취소할 수 없습니다.';
  end if;

  select id, version, canceled_at into v_id, v_version, v_canceled
  from public.submissions
  where assignment_id = p_assignment_id and student_id = auth.uid()
  order by version desc
  limit 1
  for update;
  if v_id is null or v_canceled is not null then
    raise exception '취소할 제출이 없습니다.';
  end if;

  update public.submissions set canceled_at = now() where id = v_id;
  return json_build_object('version', v_version);
end
$$;

-- ---------------------------------------------------------------------
-- 2. 과제 몰림 확인: 교사가 마감일을 고를 때, 그 반 학생들이 날짜별로 가진 마감 수.
--    다른 교사의 과제 내용은 보이지 않고 날짜별 숫자와 과목(클래스) 이름만 돌려준다.
-- ---------------------------------------------------------------------
create or replace function public.class_deadline_load(p_class_id uuid, p_from date, p_to date)
returns table (load_day date, assignment_count integer, student_count integer, max_per_student integer, class_names text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_class_teacher(p_class_id) then
    raise exception '본인 클래스만 확인할 수 있습니다.';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception '조회 기간은 최대 62일입니다.';
  end if;

  return query
  with members as (
    select e.student_id from public.enrollments e where e.class_id = p_class_id
  ), due as (
    select a.id as assignment_id, c.name as class_name,
           (a.due_at at time zone 'Asia/Seoul')::date as due_day, e.student_id
    from public.assignments a
    join public.classes c on c.id = a.class_id
    join public.enrollments e on e.class_id = a.class_id
    join members m on m.student_id = e.student_id
    where (a.due_at at time zone 'Asia/Seoul')::date between p_from and p_to
  ), per_student as (
    select due_day, student_id, count(distinct assignment_id)::integer as n
    from due group by due_day, student_id
  )
  select d.due_day,
         count(distinct d.assignment_id)::integer,
         count(distinct d.student_id)::integer,
         (select max(ps.n) from per_student ps where ps.due_day = d.due_day)::integer,
         array_agg(distinct d.class_name order by d.class_name)
  from due d
  group by d.due_day
  order by d.due_day;
end
$$;

-- ---------------------------------------------------------------------
-- 3. 자기평가서: 교사가 글 과제에 표시하면 학생이 AI 요약 초안을 받을 수 있다.
--    AI 초안을 만든 기록은 학생 본인과 담당 교사가 볼 수 있다. (투명성 + 횟수 제한)
-- ---------------------------------------------------------------------
alter table public.assignments add column if not exists purpose text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_purpose_check') then
    alter table public.assignments add constraint assignments_purpose_check
      check (purpose is null or (purpose = 'self_review' and type = 'text'));
  end if;
end
$$;

create table if not exists public.ai_draft_logs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  source_count integer not null default 0 check (source_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ai_draft_logs_lookup on public.ai_draft_logs (assignment_id, student_id, created_at desc);

alter table public.ai_draft_logs enable row level security;
revoke all on public.ai_draft_logs from anon;
grant select, insert on public.ai_draft_logs to authenticated;

drop policy if exists "ai_draft_logs: 본인과 담당 교사만 조회" on public.ai_draft_logs;
create policy "ai_draft_logs: 본인과 담당 교사만 조회" on public.ai_draft_logs
  for select to authenticated
  using (student_id = auth.uid() or public.is_assignment_teacher(assignment_id));

drop policy if exists "ai_draft_logs: 자기평가서 과제의 참여 학생만 기록" on public.ai_draft_logs;
create policy "ai_draft_logs: 자기평가서 과제의 참여 학생만 기록" on public.ai_draft_logs
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.is_assignment_member(assignment_id)
    and exists (select 1 from public.assignments a where a.id = assignment_id and a.purpose = 'self_review')
  );

revoke execute on function public.cancel_submission(uuid) from public, anon;
revoke execute on function public.class_deadline_load(uuid, date, date) from public, anon;
grant execute on function public.cancel_submission(uuid) to authenticated;
grant execute on function public.class_deadline_load(uuid, date, date) to authenticated;

commit;

-- 기존 DB: submission_log_self_review.sql 적용 후 이 파일 실행. 신규 DB: schema.sql 사용.
begin;

create table if not exists public.submission_feedback (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  updated_at timestamptz not null default now()
);
alter table public.submission_feedback enable row level security;
revoke all on public.submission_feedback from anon, authenticated;
grant select on public.submission_feedback to authenticated;
drop policy if exists feedback_read on public.submission_feedback;
create policy feedback_read on public.submission_feedback for select to authenticated using (
 exists(select 1 from public.submissions s where s.id = submission_id and (s.student_id = auth.uid() or public.is_assignment_teacher(s.assignment_id)))
);
create or replace function public.save_submission_feedback(p_submission_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_assignment uuid;
begin
 select assignment_id into v_assignment from public.submissions where id = p_submission_id;
 if not public.is_assignment_teacher(v_assignment) then raise exception '담당 교사만 피드백을 작성할 수 있습니다.'; end if;
 insert into public.submission_feedback(submission_id, teacher_id, body) values(p_submission_id, auth.uid(), btrim(p_body))
 on conflict(submission_id) do update set body = excluded.body, teacher_id = auth.uid(), updated_at = now();
end $$;

create table if not exists public.surveys (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 100),
 questions jsonb not null, anonymous boolean not null default true, due_at timestamptz not null,
 closed boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.survey_responses (
 survey_id uuid not null references public.surveys(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 answers jsonb not null, updated_at timestamptz not null default now(), primary key(survey_id, student_id)
);
alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;
revoke all on public.surveys, public.survey_responses from anon, authenticated;
grant select on public.surveys to authenticated;
drop policy if exists surveys_read on public.surveys;
create policy surveys_read on public.surveys for select to authenticated using(public.can_view_class(class_id));

create or replace function public.create_survey(p_class_id uuid, p_title text, p_questions jsonb, p_anonymous boolean, p_due_at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q jsonb; v_id uuid;
begin
 if not public.is_class_teacher(p_class_id) then raise exception '담당 교사만 설문을 만들 수 있습니다.'; end if;
 if octet_length(p_questions::text)>50000 then raise exception '질문이 너무 깁니다.'; end if;
 if p_due_at <= now() then raise exception '마감은 현재 이후로 정해 주세요.'; end if;
 if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) not between 1 and 15 then raise exception '질문은 1~15개입니다.'; end if;
 for q in select value from jsonb_array_elements(p_questions) loop
   if q->>'type' is null or q->>'type' not in ('single','multiple','text') or coalesce(char_length(btrim(q->>'title')),0) not between 1 and 300 then raise exception '질문을 확인해 주세요.'; end if;
   if q->>'type' <> 'text' then
     if jsonb_typeof(q->'options') is distinct from 'array' then raise exception '선택지를 확인해 주세요.'; end if;
     if jsonb_array_length(q->'options') not between 2 and 10 or exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 150) then raise exception '선택지는 2~10개, 각 150자 이내입니다.'; end if;
     if (select count(distinct o) from jsonb_array_elements(q->'options') o) <> jsonb_array_length(q->'options') then raise exception '선택지를 중복할 수 없습니다.'; end if;
   end if;
 end loop;
 insert into public.surveys(class_id,title,questions,anonymous,due_at) values(p_class_id,btrim(p_title),p_questions,p_anonymous,p_due_at) returning id into v_id;
 return v_id;
end $$;

create or replace function public.submit_survey(p_survey_id uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.surveys%rowtype; q jsonb; a jsonb; n integer := 0; item jsonb;
begin
 select * into s from public.surveys where id=p_survey_id for update;
 if s.id is null or not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.class_id=s.class_id and e.student_id=auth.uid() and p.role='student') then raise exception '참여 학생만 응답할 수 있습니다.'; end if;
 if s.closed or now()>s.due_at then raise exception '마감된 설문입니다.'; end if;
 if octet_length(p_answers::text)>50000 then raise exception '응답이 너무 깁니다.'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' then raise exception '응답을 확인해 주세요.'; end if;
 if jsonb_array_length(p_answers) <> jsonb_array_length(s.questions) then raise exception '모든 질문에 응답해 주세요.'; end if;
 for q in select value from jsonb_array_elements(s.questions) loop
  a := p_answers->n; n:=n+1;
  if q->>'type'='text' then
    if jsonb_typeof(a) is distinct from 'string' or char_length(btrim(a #>> '{}')) not between 1 and 2000 then raise exception '주관식 응답은 1~2000자입니다.'; end if;
  elsif q->>'type'='single' then
    if jsonb_typeof(a) is distinct from 'number' or (a #>> '{}') !~ '^[0-9]+$' then raise exception '선택지를 확인해 주세요.'; end if;
    if (a #>> '{}')::int not between 0 and jsonb_array_length(q->'options')-1 then raise exception '선택지를 확인해 주세요.'; end if;
  else
    if jsonb_typeof(a) is distinct from 'array' then raise exception '선택지를 확인해 주세요.'; end if;
    if jsonb_array_length(a) not between 1 and jsonb_array_length(q->'options') then raise exception '선택지를 확인해 주세요.'; end if;
    for item in select value from jsonb_array_elements(a) loop
      if jsonb_typeof(item) <> 'number' or (item #>> '{}') !~ '^[0-9]+$' then raise exception '선택지를 확인해 주세요.'; end if;
      if (item #>> '{}')::int not between 0 and jsonb_array_length(q->'options')-1 then raise exception '선택지를 확인해 주세요.'; end if;
    end loop;
    if (select count(distinct value) from jsonb_array_elements(a)) <> jsonb_array_length(a) then raise exception '중복 선택은 불가합니다.'; end if;
  end if;
 end loop;
 insert into public.survey_responses(survey_id,student_id,answers) values(s.id,auth.uid(),p_answers)
 on conflict(survey_id,student_id) do update set answers=excluded.answers,updated_at=now();
end $$;

create or replace function public.my_survey_response(p_survey_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select answers from public.survey_responses where survey_id=p_survey_id and student_id=auth.uid()
$$;
create or replace function public.close_survey(p_survey_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.surveys where id=p_survey_id and public.is_class_teacher(class_id)) then raise exception '담당 교사만 마감할 수 있습니다.'; end if;
 update public.surveys set closed=true where id=p_survey_id;
end $$;
create or replace function public.survey_results(p_survey_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.surveys%rowtype; n integer;
begin
 select * into s from public.surveys where id=p_survey_id;
 if s.id is null or not (public.is_class_teacher(s.class_id) or public.is_admin()) then raise exception '설문 결과를 볼 수 없습니다.'; end if;
 select count(*) into n from public.survey_responses where survey_id=s.id;
 -- 익명 설문은 마감 후 3명 이상일 때 공개한다. 응답 순서·시각·식별자는 반환하지 않는다.
 if s.anonymous and (not s.closed and now()<=s.due_at or n<3) then return jsonb_build_object('count',n,'withheld',true,'responses','[]'::jsonb); end if;
 return jsonb_build_object('count',n,'withheld',false,'responses',coalesce((
 select jsonb_agg(payload order by sort_key) from (
  select case when s.anonymous then jsonb_build_object('answers',r.answers)
    else jsonb_build_object('answers',r.answers,'name',p.name,'student_no',p.student_no) end as payload,
    case when s.anonymous then md5(r.student_id::text || s.id::text) else coalesce(p.student_no,'') end as sort_key
  from public.survey_responses r join public.profiles p on p.id=r.student_id where r.survey_id=s.id
 ) x),'[]'::jsonb));
end $$;

create table if not exists public.learning_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, href text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists learning_notifications_user_created on public.learning_notifications(user_id,created_at desc);
alter table public.learning_notifications enable row level security;
revoke all on public.learning_notifications from anon, authenticated;
grant select on public.learning_notifications to authenticated;
drop policy if exists notification_read on public.learning_notifications;
create policy notification_read on public.learning_notifications for select to authenticated using(user_id=auth.uid());
create or replace function public.mark_learning_notifications_read() returns void language sql security definer set search_path='' as $$
 update public.learning_notifications set read_at=now() where user_id=auth.uid() and read_at is null
$$;
create or replace function public.notify_learning_class_event() returns trigger language plpgsql security definer set search_path='' as $$
declare path text;
begin
 path:=case TG_TABLE_NAME when 'assignments' then '/assignments/'||new.id::text when 'surveys' then '/surveys/'||new.id::text else '/classes/'||new.class_id::text||'?tab=notices' end;
 insert into public.learning_notifications(user_id,title,href) select student_id,
 case TG_TABLE_NAME when 'assignments' then '새 과제: ' when 'surveys' then '새 설문: ' else '새 공지: ' end || new.title,path from public.enrollments where class_id=new.class_id;
 return new;
end $$;
create or replace function public.notify_learning_feedback() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.learning_notifications(user_id,title,href) select student_id,'제출물에 교사 피드백이 도착했습니다.','/assignments/'||assignment_id::text from public.submissions where id=new.submission_id;
 return new;
end $$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgname='notify_learning_assignment') then create trigger notify_learning_assignment after insert on public.assignments for each row execute function public.notify_learning_class_event(); end if;
 if not exists(select 1 from pg_trigger where tgname='notify_learning_notice') then create trigger notify_learning_notice after insert on public.notices for each row execute function public.notify_learning_class_event(); end if;
 if not exists(select 1 from pg_trigger where tgname='notify_learning_survey') then create trigger notify_learning_survey after insert on public.surveys for each row execute function public.notify_learning_class_event(); end if;
 if not exists(select 1 from pg_trigger where tgname='notify_learning_feedback') then create trigger notify_learning_feedback after insert or update on public.submission_feedback for each row execute function public.notify_learning_feedback(); end if;
end $$;

create table if not exists public.account_recovery_requests (
 id uuid primary key default gen_random_uuid(), username text not null check(char_length(username) between 3 and 30),
 name text not null check(char_length(btrim(name)) between 1 and 50), student_no text,
 status text not null default 'pending' check(status in ('pending','resolved','rejected')),
 created_at timestamptz not null default now()
);
alter table public.account_recovery_requests enable row level security;
revoke all on public.account_recovery_requests from anon, authenticated;
grant select, update(status) on public.account_recovery_requests to authenticated;
drop policy if exists recovery_admin on public.account_recovery_requests;
create policy recovery_admin on public.account_recovery_requests for all to authenticated using(public.is_admin()) with check(public.is_admin());

create table if not exists public.request_limits (
 key text primary key, attempts integer not null, window_start timestamptz not null default now()
);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from anon, authenticated;
-- service_role 전용: 서버 액션 요청 제한. 클라이언트 직접 호출은 불가.
create or replace function public.reserve_request(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.request_limits(key,attempts) values(p_key,1)
 on conflict(key) do update set attempts=case when public.request_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else public.request_limits.attempts+1 end,
 window_start=case when public.request_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else public.request_limits.window_start end
 returning attempts into n;
 return n<=p_limit;
end $$;
revoke all on function public.reserve_request(text,integer,integer) from public, anon, authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.reserve_request(text,integer,integer) to service_role;
 grant all on public.account_recovery_requests, public.request_limits to service_role;
end if; end $$;

create table if not exists public.ai_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 assignment_id uuid references public.assignments(id) on delete cascade, survey_id uuid references public.surveys(id) on delete cascade,
 kind text not null check(kind in ('feedback','draft','summary')), created_at timestamptz not null default now()
);
alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;
create or replace function public.reserve_ai_request(p_kind text, p_target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_kind in ('feedback','draft') then
  if not public.is_assignment_member(p_target) or not exists(select 1 from public.profiles where id=auth.uid() and role='student') then raise exception '참여 학생만 사용할 수 있습니다.'; end if;
  if not exists(select 1 from public.assignments where id=p_target and type='text' and (p_kind='feedback' or purpose='self_review')) then raise exception '지원하지 않는 과제입니다.'; end if;
 elsif p_kind='summary' then
  if not exists(select 1 from public.surveys where id=p_target and public.is_class_teacher(class_id)) then raise exception '담당 교사만 사용할 수 있습니다.'; end if;
 else raise exception '잘못된 AI 요청입니다.'; end if;
 -- 전역 및 사용자 한도를 같은 트랜잭션에서 확보하여 동시 호출 우회를 막는다.
 perform pg_advisory_xact_lock(8250625);
 if (select count(*) from public.ai_requests where created_at>now()-interval '1 day')>=200 then raise exception '학교의 일일 AI 이용 한도에 도달했습니다.'; end if;
 if (select count(*) from public.ai_requests where user_id=auth.uid() and created_at>now()-interval '1 day')>=10 then raise exception '하루에 AI를 10회까지 사용할 수 있습니다.'; end if;
 if (select count(*) from public.ai_requests where user_id=auth.uid() and coalesce(assignment_id,survey_id)=p_target and created_at>now()-interval '1 day')>=3 then raise exception '한 과제·설문에서 하루 3회까지 사용할 수 있습니다.'; end if;
 if exists(select 1 from public.ai_requests where user_id=auth.uid() and created_at>now()-interval '30 seconds') then raise exception '30초 후 다시 요청해 주세요.'; end if;
 insert into public.ai_requests(user_id,assignment_id,survey_id,kind) values(auth.uid(),case when p_kind<>'summary' then p_target end,case when p_kind='summary' then p_target end,p_kind) returning id into v_id;
 if p_kind='draft' then insert into public.ai_draft_logs(assignment_id,student_id) values(p_target,auth.uid()); end if;
 return v_id;
end $$;
-- 기록 위조 방지: 클라이언트는 reserve_ai_request로만 기록한다.
revoke insert on public.ai_draft_logs from authenticated;

revoke execute on function public.save_submission_feedback(uuid,text), public.create_survey(uuid,text,jsonb,boolean,timestamptz), public.submit_survey(uuid,jsonb), public.my_survey_response(uuid), public.close_survey(uuid), public.survey_results(uuid), public.mark_learning_notifications_read(), public.reserve_ai_request(text,uuid) from public, anon;
grant execute on function public.save_submission_feedback(uuid,text), public.create_survey(uuid,text,jsonb,boolean,timestamptz), public.submit_survey(uuid,jsonb), public.my_survey_response(uuid), public.close_survey(uuid), public.survey_results(uuid), public.mark_learning_notifications_read(), public.reserve_ai_request(text,uuid) to authenticated;
commit;

-- 관리자에게는 설문 집계용 클래스명만 반환하며 제출물 권한은 확장하지 않는다.
create or replace function public.admin_survey_catalog()
returns table(id uuid,title text,class_name text,anonymous boolean,due_at timestamptz,closed boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception '관리자만 조회할 수 있습니다.'; end if;
 return query select s.id,s.title,c.name,s.anonymous,s.due_at,s.closed from public.surveys s join public.classes c on c.id=s.class_id order by s.created_at desc limit 200;
end $$;
revoke execute on function public.admin_survey_catalog() from public,anon;
grant execute on function public.admin_survey_catalog() to authenticated;
drop policy if exists surveys_read on public.surveys;
create policy surveys_read on public.surveys for select to authenticated using(public.can_view_class(class_id) or public.is_admin());
