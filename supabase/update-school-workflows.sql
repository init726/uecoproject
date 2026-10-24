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
