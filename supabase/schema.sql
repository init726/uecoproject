-- =====================================================================
-- 우리학교 MVP 데이터베이스
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
