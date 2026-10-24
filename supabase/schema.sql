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
