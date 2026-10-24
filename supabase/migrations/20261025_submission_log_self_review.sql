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
