-- =====================================================================
-- 과제 취소 · 참고 자료 첨부 · 과제 몰림 확인(취소된 과제 제외)
-- 기존 프로젝트: update-school-workflows.sql 을 실행한 뒤, SQL Editor 에서 이 파일 전체를 한 번 실행한다.
--               (다시 실행해도 안전하다)
-- 신규 프로젝트: schema.sql 끝에 같은 내용이 들어 있으므로 따로 실행하지 않는다.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. 과제 취소: 행을 지우지 않고 취소한 시각만 남긴다.
--    학생 제출물은 그대로 보존되고, RLS 가 취소된 과제를 모든 화면에서 숨긴다.
-- ---------------------------------------------------------------------
alter table public.assignments add column if not exists deleted_at timestamptz;

drop policy if exists "assignments: 클래스를 볼 수 있으면 조회" on public.assignments;
create policy "assignments: 클래스를 볼 수 있으면 조회" on public.assignments
  for select to authenticated using (deleted_at is null and public.can_view_class(class_id));

drop policy if exists "assignments: 담당 교사만 수정" on public.assignments;
create policy "assignments: 담당 교사만 수정" on public.assignments
  for update to authenticated
  using (deleted_at is null and public.is_class_teacher(class_id))
  with check (public.is_class_teacher(class_id));

-- 취소는 이 함수로만 한다. (사용자가 deleted_at 을 직접 바꾸지 못하게 아래 트리거가 막는다)
create or replace function public.cancel_assignment(p_assignment_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_assignment_teacher(p_assignment_id) then
    raise exception '담당 교사만 과제를 취소할 수 있습니다.';
  end if;
  update public.assignments set deleted_at = now()
  where id = p_assignment_id and deleted_at is null;
  if not found then
    raise exception '이미 취소된 과제입니다.';
  end if;
  -- 학생 알림함에 남은 "새 과제" 알림도 지운다. (눌러도 열리지 않는 링크가 되므로)
  delete from public.learning_notifications where href = '/assignments/' || p_assignment_id::text;
end
$$;
revoke execute on function public.cancel_assignment(uuid) from public, anon;
grant execute on function public.cancel_assignment(uuid) to authenticated;

create or replace function public.guard_assignment_deleted_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and new.deleted_at is distinct from old.deleted_at then
    raise exception '과제 취소는 취소 버튼으로만 할 수 있습니다.';
  end if;
  return new;
end
$$;
drop trigger if exists before_assignment_update_deleted on public.assignments;
create trigger before_assignment_update_deleted
  before update on public.assignments
  for each row execute function public.guard_assignment_deleted_at();

-- 취소된 과제에는 새로 제출할 수 없다. (주소를 알고 있어도)
create or replace function public.block_submission_to_canceled()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.assignments where id = new.assignment_id and deleted_at is not null) then
    raise exception '취소된 과제에는 제출할 수 없습니다.';
  end if;
  return new;
end
$$;
drop trigger if exists before_submission_insert_canceled on public.submissions;
create trigger before_submission_insert_canceled
  before insert on public.submissions
  for each row execute function public.block_submission_to_canceled();

-- ---------------------------------------------------------------------
-- 2. 과제 몰림 확인: update-school-workflows.sql 의 함수에서 취소된 과제만 뺐다.
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
      and a.deleted_at is null
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
revoke execute on function public.class_deadline_load(uuid, date, date) from public, anon;
grant execute on function public.class_deadline_load(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 참고 자료: 교사가 과제에 PDF 등을 붙이고, 수업 학생이 내려받는다.
--    파일은 비공개 버킷 assignment-files/{과제 id}/{시각}.{확장자} 에 둔다.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('assignment-files', 'assignment-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "assignment-files 버킷: 담당 교사만 업로드" on storage.objects;
create policy "assignment-files 버킷: 담당 교사만 업로드" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assignment-files'
    and lower(storage.extension(name)) in ('pdf', 'hwp', 'hwpx', 'docx', 'pptx', 'xlsx', 'jpg', 'jpeg', 'png', 'zip')
    and public.is_assignment_teacher(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "assignment-files 버킷: 담당 교사와 수업 학생만 읽기" on storage.objects;
create policy "assignment-files 버킷: 담당 교사와 수업 학생만 읽기" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assignment-files'
    and (
      public.is_assignment_teacher(((storage.foldername(name))[1])::uuid)
      or public.is_assignment_member(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "assignment-files 버킷: 담당 교사만 삭제" on storage.objects;
create policy "assignment-files 버킷: 담당 교사만 삭제" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assignment-files'
    and public.is_assignment_teacher(((storage.foldername(name))[1])::uuid)
  );

create table if not exists public.assignment_files (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  file_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  file_size bigint,
  created_at timestamptz not null default now()
);
create index if not exists assignment_files_assignment on public.assignment_files (assignment_id, created_at);

alter table public.assignment_files enable row level security;
revoke all on public.assignment_files from anon;
revoke update on public.assignment_files from authenticated;
grant select, insert, delete on public.assignment_files to authenticated;

-- 과제가 보이면(=수업 담당 교사·학생, 취소되지 않음) 자료도 보인다. assignments 의 RLS 를 그대로 따른다.
drop policy if exists "assignment_files: 과제를 볼 수 있으면 조회" on public.assignment_files;
create policy "assignment_files: 과제를 볼 수 있으면 조회" on public.assignment_files
  for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id));

drop policy if exists "assignment_files: 담당 교사만 등록" on public.assignment_files;
create policy "assignment_files: 담당 교사만 등록" on public.assignment_files
  for insert to authenticated
  with check (public.is_assignment_teacher(assignment_id));

drop policy if exists "assignment_files: 담당 교사만 삭제" on public.assignment_files;
create policy "assignment_files: 담당 교사만 삭제" on public.assignment_files
  for delete to authenticated
  using (public.is_assignment_teacher(assignment_id));

-- 등록할 때: 경로가 그 과제 폴더인지, 실제로 올라간 파일인지 확인하고 크기는 저장소 값으로 채운다.
create or replace function public.prepare_assignment_file()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_size bigint;
begin
  if split_part(new.file_path, '/', 1) <> new.assignment_id::text then
    raise exception '이 과제의 파일만 등록할 수 있습니다.';
  end if;
  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o
  where o.bucket_id = 'assignment-files' and o.name = new.file_path;
  if not found then
    raise exception '올라간 파일을 찾을 수 없습니다.';
  end if;
  new.file_size := v_size;
  new.created_at := now();
  return new;
end
$$;
drop trigger if exists before_assignment_file_insert on public.assignment_files;
create trigger before_assignment_file_insert
  before insert on public.assignment_files
  for each row execute function public.prepare_assignment_file();

commit;
