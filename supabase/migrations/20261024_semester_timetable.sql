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
