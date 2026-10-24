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
