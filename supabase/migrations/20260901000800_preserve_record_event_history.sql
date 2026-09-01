alter table public.workout_sessions
drop constraint workout_sessions_user_id_workout_date_workout_type_key,
add column event_order bigint check (event_order > 0);

alter table public.routine_completions
drop constraint routine_completions_user_id_workout_date_routine_id_key,
add column event_order bigint check (event_order > 0),
add column is_completed boolean;

create sequence public.record_event_order_seq;

revoke all on sequence public.record_event_order_seq from public, anon, authenticated;
grant usage on sequence public.record_event_order_seq to authenticated;

create index workout_sessions_latest_event_idx
on public.workout_sessions (user_id, workout_date, workout_type, event_order desc nulls last);

create index routine_completions_latest_event_idx
on public.routine_completions (user_id, workout_date, routine_id, event_order desc nulls last);

drop policy "Users can update their own workout sessions"
on public.workout_sessions;

drop policy "Users can delete their own workout sessions"
on public.workout_sessions;

drop policy "Users can update their own routine completions"
on public.routine_completions;

drop policy "Users can delete their own routine completions"
on public.routine_completions;

revoke all on public.workout_sessions, public.routine_completions
from public, anon, authenticated;
grant select, insert on public.workout_sessions, public.routine_completions
to authenticated;

create function public.stamp_record_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.event_order := nextval('public.record_event_order_seq'::regclass);
  if tg_table_name = 'workout_sessions' then
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
  else
    new.completed_at := statement_timestamp();
  end if;
  return new;
end;
$$;

create trigger stamp_workout_session_event
before insert on public.workout_sessions
for each row execute function public.stamp_record_event();

create trigger stamp_routine_completion_event
before insert on public.routine_completions
for each row execute function public.stamp_record_event();

create function public.enforce_workout_session_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_event public.workout_sessions%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'workout|' || new.user_id::text || '|' || new.workout_date::text || '|' || new.workout_type,
    0
  ));

  select event.*
  into previous_event
  from public.workout_sessions as event
  where event.user_id = new.user_id
    and event.workout_date = new.workout_date
    and event.workout_type = new.workout_type
  order by event.event_order desc nulls last
  limit 1;

  if found then
    if new.target_total <> previous_event.target_total then
      raise exception 'Workout event edits must keep the original target'
        using errcode = '23514';
    end if;
    new.program_version_id := previous_event.program_version_id;
  end if;

  return new;
end;
$$;

-- These event triggers intentionally sort before the existing *_program_version
-- triggers so inherited provenance is restored before Gear Second validation.
create trigger enforce_workout_session_event
before insert on public.workout_sessions
for each row execute function public.enforce_workout_session_event();

create function public.enforce_routine_completion_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_event public.routine_completions%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'completion|' || new.user_id::text || '|' || new.workout_date::text || '|' || new.routine_id,
    0
  ));

  select event.*
  into previous_event
  from public.routine_completions as event
  where event.user_id = new.user_id
    and event.workout_date = new.workout_date
    and event.routine_id = new.routine_id
  order by event.event_order desc nulls last
  limit 1;

  if new.is_completed is null then
    raise exception 'New completion events require is_completed'
      using errcode = '23502';
  end if;

  if not new.is_completed then
    if not found or not coalesce(previous_event.is_completed, true) then
      raise exception 'Only a current completion can be cancelled'
        using errcode = '23514';
    end if;

    if new.details is distinct from previous_event.details then
      raise exception 'Cancellation must preserve the completed result details'
        using errcode = '23514';
    end if;
  end if;

  if found then
    new.program_version_id := previous_event.program_version_id;
  end if;

  return new;
end;
$$;

create trigger enforce_routine_completion_event
before insert on public.routine_completions
for each row execute function public.enforce_routine_completion_event();

create view public.workout_session_history
with (security_invoker = true)
as
select
  event.*,
  row_number() over (
    partition by event.user_id, event.workout_date, event.workout_type
    order by coalesce(event.event_order, 0) desc
  ) = 1 as is_current
from public.workout_sessions as event;

create view public.routine_completion_history
with (security_invoker = true)
as
select
  event.id,
  event.user_id,
  event.workout_date,
  event.routine_id,
  event.program_version_id,
  event.details,
  event.completed_at,
  event.event_order,
  coalesce(event.is_completed, true) as is_completed,
  row_number() over (
    partition by event.user_id, event.workout_date, event.routine_id
    order by coalesce(event.event_order, 0) desc
  ) = 1 as is_current
from public.routine_completions as event;

revoke all on public.workout_session_history from public, anon, authenticated;
revoke all on public.routine_completion_history from public, anon, authenticated;
grant select on public.workout_session_history to authenticated;
grant select on public.routine_completion_history to authenticated;

create or replace function public.enforce_record_program_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected_dow integer;
  has_previous boolean;
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'workout_sessions' then
      select exists (
        select 1
        from public.workout_sessions as event
        where event.user_id = new.user_id
          and event.workout_date = new.workout_date
          and event.workout_type = new.workout_type
      ) into has_previous;
    else
      select exists (
        select 1
        from public.routine_completions as event
        where event.user_id = new.user_id
          and event.workout_date = new.workout_date
          and event.routine_id = new.routine_id
      ) into has_previous;
    end if;

    if not has_previous then
      if new.program_version_id is null then
        raise exception 'New workout records require a program version'
          using errcode = '23502';
      end if;

      if not exists (
        select 1
        from public.workout_program_versions as program
        where program.id = new.program_version_id
          and program.id = (
            select active_program.id
            from public.workout_program_versions as active_program
            where active_program.program_key = program.program_key
              and active_program.effective_from <= new.workout_date
            order by active_program.effective_from desc, active_program.version desc
            limit 1
          )
      ) then
        raise exception 'Program version is not active for workout date'
          using errcode = '23514';
      end if;
    end if;
  else
    if new.program_version_id is distinct from old.program_version_id then
      raise exception 'Workout record program version is immutable'
        using errcode = '55000';
    end if;

    if new.workout_date is distinct from old.workout_date then
      raise exception 'Workout record date is immutable'
        using errcode = '55000';
    end if;
  end if;

  if new.program_version_id in (
    'luke-weekly-2026-09-02',
    'luke-weekly-2026-09-02-canonical'
  ) then
    if tg_table_name = 'workout_sessions' then
      expected_dow := case new.workout_type
        when 'recovery_pushup' then 1
        when 'pullup' then 3
        when 'pushup' then 4
        when 'sunday_pullup' then 0
      end;
      if expected_dow is null or extract(dow from new.workout_date)::integer <> expected_dow then
        raise exception 'Workout type does not match the Gear Second weekday'
          using errcode = '23514';
      end if;

      if new.workout_type = 'pullup' then
        if new.total_reps <> new.target_total then
          raise exception 'Gear Second pull-up records must complete the target total'
            using errcode = '23514';
        end if;
        if jsonb_typeof(new.details -> 'treadmill_speed') is distinct from 'number' then
          raise exception 'Gear Second pull-up records require treadmill_speed'
            using errcode = '23514';
        end if;
        if (new.details ->> 'treadmill_speed')::numeric < 7 then
          raise exception 'Gear Second pull-up treadmill_speed must be at least 7'
            using errcode = '23514';
        end if;
      elsif new.workout_type = 'pushup' then
        if new.set_count is null then
          raise exception 'Gear Second push-up records require set_count'
            using errcode = '23514';
        end if;
        if jsonb_typeof(new.details -> 'plank_succeeded') is distinct from 'boolean'
          or jsonb_typeof(new.details -> 'plank_hold_seconds') is distinct from 'number'
          or jsonb_typeof(new.details -> 'plank_rest_seconds') is distinct from 'number' then
          raise exception 'Gear Second push-up records require plank result and timings'
            using errcode = '23514';
        end if;
        if (new.details ->> 'plank_hold_seconds')::numeric < 1
          or (new.details ->> 'plank_hold_seconds')::numeric <> trunc((new.details ->> 'plank_hold_seconds')::numeric)
          or (new.details ->> 'plank_rest_seconds')::numeric < 1
          or (new.details ->> 'plank_rest_seconds')::numeric <> trunc((new.details ->> 'plank_rest_seconds')::numeric) then
          raise exception 'Gear Second plank timings must be positive whole seconds'
            using errcode = '23514';
        end if;
      end if;
    else
      expected_dow := case new.routine_id
        when 'mon' then 1
        when 'tue' then 2
        when 'fri' then 5
        when 'sat' then 6
        when 'sun' then 0
      end;
      if expected_dow is null or extract(dow from new.workout_date)::integer <> expected_dow then
        raise exception 'Completion routine does not match the Gear Second weekday'
          using errcode = '23514';
      end if;

      if new.routine_id = 'sat' then
        if jsonb_typeof(new.details -> 'dips_max_reps') is distinct from 'number'
          or jsonb_typeof(new.details -> 'treadmill_speed') is distinct from 'number' then
          raise exception 'Gear Second Press completion requires dips and treadmill results'
            using errcode = '23514';
        end if;
        if (new.details ->> 'dips_max_reps')::numeric < 0
          or (new.details ->> 'dips_max_reps')::numeric <> trunc((new.details ->> 'dips_max_reps')::numeric)
          or (new.details ->> 'treadmill_speed')::numeric < 10 then
          raise exception 'Gear Second Press results are outside the allowed range'
            using errcode = '23514';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create function public.reject_record_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' or current_user in ('anon', 'authenticated') then
    raise exception 'Workout record events are append-only'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger block_workout_session_event_mutation
before update or delete on public.workout_sessions
for each row execute function public.reject_record_event_mutation();

create trigger block_routine_completion_event_mutation
before update or delete on public.routine_completions
for each row execute function public.reject_record_event_mutation();

drop function public.get_admin_routine_history(text);

create function public.get_admin_routine_history(target_routine_id text)
returns table (
  event_id uuid,
  user_id uuid,
  user_email text,
  workout_date date,
  record_kind text,
  routine_id text,
  workout_type text,
  program_version_id text,
  target_total integer,
  total_reps integer,
  set_count integer,
  set_reps integer[],
  details jsonb,
  recorded_at timestamptz,
  event_order bigint,
  is_completed boolean,
  is_current boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'email'), '') <> 'mainbbong@gmail.com' then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if target_routine_id not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') then
    raise exception 'Invalid routine id'
      using errcode = '22023';
  end if;

  return query
    select history_record.*
    from (
      select
        workout.id as event_id,
        workout.user_id,
        auth_user.email::text as user_email,
        workout.workout_date,
        'workout_session'::text as record_kind,
        null::text as routine_id,
        workout.workout_type,
        workout.program_version_id,
        workout.target_total,
        workout.total_reps,
        workout.set_count,
        workout.set_reps,
        workout.details,
        workout.updated_at as recorded_at,
        workout.event_order,
        null::boolean as is_completed,
        row_number() over (
          partition by workout.user_id, workout.workout_date, workout.workout_type
          order by coalesce(workout.event_order, 0) desc
        ) = 1 as is_current
      from public.workout_sessions as workout
      join auth.users as auth_user on auth_user.id = workout.user_id
      where extract(dow from workout.workout_date)::integer = case target_routine_id
        when 'sun' then 0
        when 'mon' then 1
        when 'tue' then 2
        when 'wed' then 3
        when 'thu' then 4
        when 'fri' then 5
        when 'sat' then 6
      end

      union all

      select
        completion.id as event_id,
        completion.user_id,
        auth_user.email::text as user_email,
        completion.workout_date,
        'routine_completion'::text as record_kind,
        completion.routine_id,
        null::text as workout_type,
        completion.program_version_id,
        null::integer as target_total,
        null::integer as total_reps,
        null::integer as set_count,
        null::integer[] as set_reps,
        completion.details,
        completion.completed_at as recorded_at,
        completion.event_order,
        coalesce(completion.is_completed, true) as is_completed,
        row_number() over (
          partition by completion.user_id, completion.workout_date, completion.routine_id
          order by coalesce(completion.event_order, 0) desc
        ) = 1 as is_current
      from public.routine_completions as completion
      join auth.users as auth_user on auth_user.id = completion.user_id
      where completion.routine_id = target_routine_id
    ) as history_record
    order by history_record.workout_date desc, history_record.event_order desc nulls last;
end;
$$;

revoke execute on function public.get_admin_routine_history(text) from public;
revoke execute on function public.get_admin_routine_history(text) from anon;
grant execute on function public.get_admin_routine_history(text) to authenticated;

drop function public.get_admin_monthly_records(date);

create function public.get_admin_monthly_records(target_month date)
returns table (
  user_id uuid,
  user_email text,
  workout_date date,
  record_kind text,
  routine_id text,
  workout_type text,
  program_version_id text,
  target_total integer,
  total_reps integer,
  set_count integer,
  set_reps integer[],
  details jsonb,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_start date;
  month_end date;
begin
  if coalesce((select auth.jwt() ->> 'email'), '') <> 'mainbbong@gmail.com' then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if target_month is null then
    raise exception 'Target month is required'
      using errcode = '22004';
  end if;

  month_start := date_trunc('month', target_month)::date;
  month_end := (month_start + interval '1 month')::date;

  return query
    select
      auth_user.id,
      auth_user.email::text,
      monthly_record.workout_date,
      monthly_record.record_kind,
      monthly_record.routine_id,
      monthly_record.workout_type,
      monthly_record.program_version_id,
      monthly_record.target_total,
      monthly_record.total_reps,
      monthly_record.set_count,
      monthly_record.set_reps,
      monthly_record.details,
      monthly_record.recorded_at
    from auth.users as auth_user
    left join lateral (
      select
        workout.workout_date,
        'workout_session'::text as record_kind,
        null::text as routine_id,
        workout.workout_type,
        workout.program_version_id,
        workout.target_total,
        workout.total_reps,
        workout.set_count,
        workout.set_reps,
        workout.details,
        workout.updated_at as recorded_at
      from public.workout_sessions as workout
      where workout.user_id = auth_user.id
        and workout.workout_date >= month_start
        and workout.workout_date < month_end
        and workout.id = (
          select latest.id
          from public.workout_sessions as latest
          where latest.user_id = workout.user_id
            and latest.workout_date = workout.workout_date
            and latest.workout_type = workout.workout_type
          order by coalesce(latest.event_order, 0) desc
          limit 1
        )

      union all

      select
        completion.workout_date,
        'routine_completion'::text as record_kind,
        completion.routine_id,
        null::text as workout_type,
        completion.program_version_id,
        null::integer as target_total,
        null::integer as total_reps,
        null::integer as set_count,
        null::integer[] as set_reps,
        completion.details,
        completion.completed_at as recorded_at
      from public.routine_completions as completion
      where completion.user_id = auth_user.id
        and completion.workout_date >= month_start
        and completion.workout_date < month_end
        and completion.is_completed is not false
        and completion.id = (
          select latest.id
          from public.routine_completions as latest
          where latest.user_id = completion.user_id
            and latest.workout_date = completion.workout_date
            and latest.routine_id = completion.routine_id
          order by coalesce(latest.event_order, 0) desc
          limit 1
        )
    ) as monthly_record on true
    order by
      auth_user.email nulls last,
      auth_user.id,
      monthly_record.workout_date nulls last,
      monthly_record.record_kind nulls last,
      monthly_record.routine_id nulls last,
      monthly_record.workout_type nulls last,
      monthly_record.recorded_at nulls last;
end;
$$;

revoke execute on function public.get_admin_monthly_records(date) from public;
revoke execute on function public.get_admin_monthly_records(date) from anon;
grant execute on function public.get_admin_monthly_records(date) to authenticated;

insert into public.workout_program_versions (
  id,
  program_key,
  version,
  definition,
  effective_from,
  source_url
)
values (
  'luke-weekly-2026-09-02-canonical',
  'luke-weekly',
  3,
  $program$
{
  "schemaVersion": 1,
  "programKey": "luke-weekly",
  "title": "루크 Gear Second 운동 프로그램",
  "timezone": "Asia/Seoul",
  "cycle": "weekly",
  "effectiveFrom": "2026-09-02",
  "sourceUrl": "https://app.notion.com/p/3cebe971bff78144884ffe8cc7623006",
  "safety": {
    "stopWhen": ["예리한 통증", "흉통", "어지럼증"],
    "disclaimer": "이 프로그램은 사용자가 직접 정한 운동 계획이며 의료 진단이나 치료를 대신하지 않습니다."
  },
  "progressions": {
    "recovery_pushup": {
      "routineId": "mon",
      "initialTarget": 15,
      "increment": 1,
      "setCount": 5,
      "success": "all_sets_at_or_above_target",
      "failure": "hold",
      "scope": "user"
    },
    "pushup": {
      "routineId": "thu",
      "initialTarget": 100,
      "increment": 10,
      "earlySuccessSetCount": 4,
      "earlyIncrement": 20,
      "setCount": 5,
      "success": "total_reps_at_or_above_target",
      "failure": "hold",
      "scope": "user"
    },
    "pullup": {
      "routineId": "wed",
      "initialTarget": 30,
      "increment": 10,
      "successSetCount": 10,
      "success": "target_completed_at_or_below_set_count",
      "failure": "hold",
      "scope": "user"
    },
    "sunday_pullup": {
      "routineId": "sun",
      "initialTarget": 5,
      "increment": 1,
      "setCount": 5,
      "success": "all_sets_unassisted_at_or_above_target",
      "failure": "hold",
      "scope": "user"
    },
    "plank": {
      "routineId": "thu",
      "initialHoldSeconds": 40,
      "initialRestSeconds": 20,
      "holdIncrementSeconds": 10,
      "restIncrementSeconds": 5,
      "setCount": 3,
      "success": "all_sets_completed",
      "failure": "hold",
      "scope": "user"
    }
  },
  "days": [
    {
      "id": "mon",
      "day": "MON",
      "ko": "월요일",
      "status": "ready",
      "short": "푸쉬업 {{recoveryPushTarget}}×5 + 스쿼트",
      "category": "GEAR SECOND · PUSH RECOVERY",
      "title": "리커버리 푸쉬업 + 에어 스쿼트",
      "summary": "푸쉬업 목표를 정자세로 끝까지 연결하고, 세트 사이에 에어 스쿼트를 수행합니다.",
      "target": "오늘 목표 · 푸쉬업 {{recoveryPushTarget}}회 × 5세트 + 에어 스쿼트 15회 × 5세트",
      "inputs": "운동 날짜 + 리커버리 푸쉬업 5세트 각각의 실제 횟수 + 에어 스쿼트를 포함한 루틴 완료 체크",
      "completion": true,
      "exercises": [
        {
          "name": "리커버리 푸쉬업",
          "prescription": "{{recoveryPushTarget}}회 × 5세트",
          "note": "목표 횟수를 최대한 언브로큰으로 수행합니다. 멈추더라도 3초 안에 다시 시작하며, 3초마다 1회씩 하더라도 정자세 푸쉬업으로 목표를 모두 마친 뒤 쉽니다. 인클라인·무릎 푸쉬업은 허용하지 않습니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 푸쉬업 정자세 4가지", "url": "https://www.youtube.com/shorts/tLP4k0JKI8Q" },
            { "label": "한국어 상세 · 완벽한 푸쉬업 자세", "url": "https://www.youtube.com/watch?v=-_DUjHxgmWk" },
            { "label": "ACE · Push-up", "url": "https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/" }
          ]
        },
        {
          "name": "휴식 동안 에어 스쿼트",
          "prescription": "15회 × 5세트 · 휴식 1분 30초~2분 30초",
          "note": "세트 사이 1분 30초~2분 30초 휴식시간을 가집니다. 휴식 시간 안에 정해진 에어스쿼트 횟수를 수행하고 휴식시간이 모두 끝나면 바로 다음 세트를 시작합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 에어 스쿼트", "url": "https://www.youtube.com/shorts/8LMgns1JgXY" },
            { "label": "한국어 상세 · 에어 스쿼트", "url": "https://www.youtube.com/watch?v=y3VibY25wMM" },
            { "label": "ACE · Bodyweight Squat", "url": "https://www.acefitness.org/resources/everyone/exercise-library/135/bodyweight-squat/" }
          ]
        },
        {
          "name": "과부하와 Rep 기준",
          "prescription": "5세트 성공 +1회/세트 · 실패 유지",
          "note": "5세트 모두 목표 이상 성공하면 다음 월요일부터 세트당 1회 증가, 한 세트라도 실패하면 유지. 로그인 사용자별 기록만 사용합니다. 에어스쿼트는 엉덩이가 무릎보다 아래까지 내려와야 인정입니다. 푸쉬업은 가슴이 팔꿈치와 평행 혹은 더 아래까지 내려가야 인정입니다."
        }
      ]
    },
    {
      "id": "tue",
      "day": "TUE",
      "ko": "화요일",
      "status": "ready",
      "short": "완전 휴식",
      "category": "GEAR SECOND · REST DAY",
      "title": "완전 휴식",
      "summary": "별도 운동 없이 다음 훈련을 위해 회복합니다.",
      "target": "오늘 목표 · 운동 없음",
      "inputs": "휴식 완료 체크",
      "completion": true,
      "exercises": [
        {
          "name": "휴식",
          "prescription": "운동 없음",
          "note": "피로감이나 통증이 남아 있다면 회복을 우선합니다."
        }
      ]
    },
    {
      "id": "wed",
      "day": "WED",
      "ko": "수요일",
      "status": "ready",
      "short": "풀업 {{pullTarget}} + 러닝 15분",
      "category": "GEAR SECOND · PULL MISSION",
      "title": "풀업 미션 + 러닝머신",
      "summary": "한 세트의 횟수는 자유롭게 끊되, 목표 총량을 모두 채울 때까지 반복합니다.",
      "target": "현재 목표 · 풀업 총 {{pullTarget}}회 + 러닝머신 15분",
      "inputs": "운동 날짜 + 풀업 목표 총량 완료에 사용한 전체 세트 수 + 러닝머신 15분 동안 유지한 속도",
      "exercises": [
        {
          "name": "1. 오늘의 종료 조건",
          "prescription": "총 {{pullTarget}}회 · 완료할 때까지",
          "note": "정해진 총량을 모두 채우면 종료합니다. 세트 수 상한은 없으며 10세트를 넘겨도 목표 횟수를 채울 때까지 계속합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 풀업 정자세", "url": "https://www.youtube.com/shorts/Ka1uGBFHoRU" },
            { "label": "한국어 상세 · 완벽한 풀업 자세", "url": "https://www.youtube.com/watch?v=nWhS28U6bCY" },
            { "label": "NASM · Pull-Up", "url": "https://www.nasm.org/resource-center/exercise-library/pull-up" }
          ]
        },
        {
          "name": "2. 세트 수행과 휴식",
          "prescription": "철봉에서 내려오면 1분 30초",
          "note": "한 세트에 몇 회씩 끊는지는 자유입니다. 철봉에서 내려오면 1분 30초 쉬고 바로 다음 세트에 들어갑니다."
        },
        {
          "name": "3. 성공 판정 예시",
          "prescription": "30회 · 10세트 이내 성공",
          "note": "예: 5, 5, 3, 3, 3, 3, 2, 2, 2, 2 = 총 30회, 10세트 성공."
        },
        {
          "name": "4. 다음 풀업 데이",
          "prescription": "10세트 이내 +10회 · 11세트 이상 유지",
          "note": "10세트 이내 완료하면 다음 풀업 데이 목표 +10회, 11세트 이상이면 같은 목표를 유지합니다. 전체 세트 수를 반드시 기록합니다."
        },
        {
          "name": "러닝머신",
          "prescription": "속도 7 이상 · 15분",
          "note": "풀업 미션 뒤 진행합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 러닝머신 자세", "url": "https://www.youtube.com/shorts/KH00qS65gZA" },
            { "label": "한국어 상세 · 트레드밀 적응과 자세", "url": "https://www.youtube.com/watch?v=h2dJZbcKfto" }
          ]
        }
      ]
    },
    {
      "id": "thu",
      "day": "THU",
      "ko": "목요일",
      "status": "ready",
      "short": "푸쉬업 {{pushTarget}} + 플랭크",
      "category": "GEAR SECOND · PUSH MISSION",
      "title": "푸쉬업 맥스 미션 + 플랭크",
      "summary": "푸쉬업 목표를 최대 5세트 안에 채우고, 플랭크 타바타 3세트를 진행합니다.",
      "target": "현재 목표 · 푸쉬업 합계 {{pushTarget}}회 + 플랭크 {{plankHoldSeconds}}/{{plankRestSeconds}}초 × 3세트",
      "inputs": "운동 날짜 + 푸쉬업 전체 합계 + 목표 완료에 사용한 세트 수 + 플랭크 타바타 3세트 성공 여부 + 적용한 Hold/휴식 시간",
      "exercises": [
        {
          "name": "1. 세트 수행",
          "prescription": "최대 5세트",
          "note": "각 세트는 정자세를 유지할 수 있는 실패 직전까지 수행합니다. 자세가 무너지기 시작하면 그 세트를 종료합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 푸쉬업 정자세 4가지", "url": "https://www.youtube.com/shorts/tLP4k0JKI8Q" },
            { "label": "한국어 상세 · 완벽한 푸쉬업 자세", "url": "https://www.youtube.com/watch?v=-_DUjHxgmWk" },
            { "label": "ACE · Push-up", "url": "https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/" }
          ]
        },
        {
          "name": "2. 세트 사이",
          "prescription": "1분 30초",
          "note": "세트가 끝나면 정확히 1분 30초 쉬고 다음 세트를 시작하며 최대 5세트까지만 진행합니다."
        },
        {
          "name": "3. 오늘의 성공 판정",
          "prescription": "합계 {{pushTarget}}회",
          "note": "5세트 합계가 목표 이상이면 성공, 미만이면 실패입니다. 결과에는 5세트 합계를 기록합니다."
        },
        {
          "name": "4. 다음 푸쉬업 데이",
          "prescription": "성공 +10회 · 실패 유지",
          "note": "성공하면 다음 목요일 목표 +10회, 실패하면 유지합니다. 로그인 사용자별 기록만 사용합니다."
        },
        {
          "name": "5. 5세트 전 조기 성공",
          "prescription": "4세트 이내 성공 +20회",
          "note": "5세트로 나눠서 할 필요는 없습니다. 5세트 전에 끝나면 다음 목요일 목표는 +20회를 적용합니다. ( 예. 100회 목표 시 25 25 25 25 로 4세트만에 끝난다면 다음 주 목표는 120회 )"
        },
        {
          "name": "플랭크 타바타",
          "prescription": "{{plankHoldSeconds}}초 Hold / {{plankRestSeconds}}초 휴식 × 3세트",
          "note": "TABATA 타이머 켜두고 40초 Hold, 20초 휴식으로 3세트 진행합니다, 3세트 성공 시 다음 운동에서 HOLD 는 10초, 휴식은 5초씩 증가합니다. ( 40/20 으로 3세트 성공 시 , 다음은 50/25 로 3세트 도전, )",
          "guides": [
            { "label": "한국어 쇼츠 · 완벽한 플랭크 정자세", "url": "https://www.youtube.com/shorts/jLXL6pIeRvc" },
            { "label": "한국어 상세 · 완벽한 플랭크 자세", "url": "https://www.youtube.com/watch?v=Zq8nRY9P_cM" },
            { "label": "ACE · Front Plank", "url": "https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/" }
          ]
        }
      ]
    },
    {
      "id": "fri",
      "day": "FRI",
      "ko": "금요일",
      "status": "ready",
      "short": "푸쉬업 기술",
      "category": "GEAR SECOND · PUSH SKILL",
      "title": "푸쉬업 기술 루틴",
      "summary": "영상의 동작과 순서를 그대로 따라 하며 반복 수보다 기술을 익힙니다.",
      "target": "현재 목표 · 영상 루틴 20분 완주",
      "inputs": "푸쉬업 기술 루틴 완료 체크",
      "completion": true,
      "exercises": [
        {
          "name": "영상 가이드 루틴",
          "prescription": "20분 · 1회",
          "note": "동작과 순서 그대로 1회 수행합니다."
        },
        {
          "name": "동작 사이 휴식",
          "prescription": "15초"
        }
      ],
      "link": {
        "label": "초보자가 꼭 해야 할 푸쉬업 20분 루틴",
        "url": "https://www.youtube.com/watch?v=Di-lTiYsQeE"
      }
    },
    {
      "id": "sat",
      "day": "SAT",
      "ko": "토요일",
      "status": "ready",
      "short": "Press 데이 + 러닝 5분",
      "category": "GEAR SECOND · PRESS DAY",
      "title": "Press 데이",
      "summary": "가슴·어깨·삼두 Press 루틴을 수행하고 러닝머신 5분으로 마무리합니다.",
      "target": "오늘 목표 · 상체 하체 6종 + 러닝머신 5분",
      "inputs": "딥스 1세트 최대 횟수 + 러닝머신 5분 동안 유지한 최고 속도 + Press 루틴 완료 체크",
      "completion": true,
      "exercises": [
        {
          "name": "덤벨 벤치 프레스",
          "prescription": "10회 × 5세트",
          "note": "첫 세트 RPE 7~8 무게를 유지합니다. 10회 실패 시 다음 세트부터 감량해 10회를 채웁니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 덤벨프레스 핵심 5가지", "url": "https://www.youtube.com/shorts/O9dq5ewczpI" },
            { "label": "한국어 상세 · 덤벨프레스 자세", "url": "https://www.youtube.com/watch?v=wKHBr_Q_m1M" },
            { "label": "ACE · Chest Press", "url": "https://www.acefitness.org/resources/everyone/exercise-library/19/chest-press/" }
          ]
        },
        {
          "name": "체스트 프레스 머신",
          "prescription": "15회 × 3세트",
          "note": "첫 15회 RPE 7~8 무게로 진행하며 실패 시 감량해 남은 세트의 15회를 채웁니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 체스트프레스 머신 사용법", "url": "https://www.youtube.com/shorts/B7XERsTO7fA" },
            { "label": "한국어 상세 · 체스트프레스 머신 기구 사용법", "url": "https://www.youtube.com/watch?v=6Y7zjxzmYDc" },
            { "label": "ACE · Seated Chest Press", "url": "https://www.acefitness.org/resources/everyone/exercise-library/188/seated-chest-press/" }
          ]
        },
        {
          "name": "치닝디핑 머신 딥스",
          "prescription": "1세트 Max Reps · 2~3세트 Max Reps의 50%",
          "note": "1세트 Max Reps 진행 , 2,3세트는 Max Reps 의 50% 개수만 진행. 딥스는 자세가 안좋으면 부상을 입기 쉬움. 반드시 쇼츠/동영상 가이드로 안전하고 정확한 자세를 머리로 숙달 후 운동 수행할 것. 그리고 수행 중 어깨의 찝힘 같은 불편감이 있다면 동작 수행을 멈추고 Push Up 으로 전환하되, 팔꿈치를 옆구리에 완전히 붙히고 삼두에 집중하는 푸쉬업으로 변경해서 동일하게 3세트 진행할 것.",
          "guides": [
            { "label": "한국어 쇼츠 · 어시스트 딥스 사용법", "url": "https://www.youtube.com/shorts/KHJyXBXZbrw" },
            { "label": "한국어 상세 · 치닝디핑 머신 딥스", "url": "https://www.youtube.com/watch?v=GopIh2JyVXs" },
            { "label": "대체 동작 쇼츠 · 클로즈 푸시업", "url": "https://www.youtube.com/shorts/dLX--SxLwxo" },
            { "label": "대체 동작 상세 · 클로즈 그립 푸쉬업", "url": "https://www.youtube.com/watch?v=9sEUWvy6Tus" },
            { "label": "ACE · 팔꿈치를 붙인 Push-up", "url": "https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/" }
          ]
        },
        {
          "name": "사이드 레터럴 레이즈",
          "prescription": "15회 × 5세트",
          "note": "어 이렇게 가벼워도 되나? 정도의 무게, 4kg 정도부터 추천하고, 무게를 점차 올려갈 것을 추천. 3세트까진 무게를 올리고 15회 진행이 안된다면 이후에 내리면서 진행. 이 역시 다양한 동작 가이드가 있으나 중요한 것은 통증이 없고, 승모에 힘이 덜들어가는 본인 만의 진행 방향/견갑 상태(보통 견갑을 바깥으로 빼고 진행해야 승모에 힘이 덜들어감. 진행 방향은 완전한 수평 레이즈보다 앞으로 살짝 기울어진 방향이 수평 레이즈 시 통증이 있다면 완화시켜줄 수 있음)를 찾고 진행할 것. 그리고 팔을 올릴 땐 빠르게, 내려올 때 천천히 하는 것에 집중하도록 함. 존나 털렸을 땐 반동으로라도 덤벨을 올리되 내려올 땐 천천히 버티면서 내려오는 것에 집중할 것.",
          "guides": [
            { "label": "한국어 쇼츠 · 사이드 레터럴 레이즈", "url": "https://www.youtube.com/shorts/1HhMAvo9zTg" },
            { "label": "한국어 상세 · 사이드 레터럴 레이즈 자세", "url": "https://www.youtube.com/watch?v=YdhHnZxcpgY" },
            { "label": "ACE · Lateral Raise", "url": "https://www.acefitness.org/resources/everyone/exercise-library/26/lateral-raise/" }
          ]
        },
        {
          "name": "덤벨 숄더 프레스",
          "prescription": "10회 × 5세트",
          "note": "첫 세트 RPE 7~8 무게를 유지합니다. 10회 실패 시 다음 세트부터 감량해 10회를 채웁니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 덤벨 숄더프레스 핵심 4가지", "url": "https://www.youtube.com/shorts/QqhMqG8YO2k" },
            { "label": "한국어 상세 · 덤벨 숄더프레스 기초 자세", "url": "https://www.youtube.com/watch?v=OMCJoZfKhxM" },
            { "label": "ACE · Seated Overhead Press", "url": "https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/" }
          ]
        },
        {
          "name": "바벨 혹은 덤벨 스컬 크러셔",
          "prescription": "10회 × 3세트",
          "note": "첫 세트 RPE 7 무게를 유지합니다. 10회 실패 시 다음 세트부터 감량해서 10회를 채웁니다. 이 역시 자세 공부를 꼭 하고 갑니다. 최대한 팔꿈치와 바닥의 각도가 90도보다 작아지지 않도록 유지할 수 있게 신경 씁니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 덤벨 스컬크러셔", "url": "https://www.youtube.com/shorts/ei_-H1CsXDo" },
            { "label": "한국어 상세 · 라잉 트라이셉스 익스텐션", "url": "https://www.youtube.com/watch?v=QG0JbDaROwk" }
          ]
        },
        {
          "name": "숄더 프레스 머신",
          "prescription": "20회 × 3세트",
          "note": "이미 어깨 가슴 다 털려서 더할 필요가 있나 싶은 수준의 상태입니다. 가벼운 무게로 비교적 빠른 속도로 진행합니다. 무게 기준은 그날의 멘탈이 시키는대로 하시되 20회 씩 채워야만 합니다. 입에서 호흡음이 새어나가며 이빨 사이로 침이 뿜어져 나오며 진행하게 되는 마지막 세트임을 명심하고 전력질주 합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 숄더프레스 머신", "url": "https://www.youtube.com/shorts/OS9dj9nUPuo" },
            { "label": "한국어 상세 · 숄더프레스 머신 사용법", "url": "https://www.youtube.com/watch?v=qFh1p1Afp_c" },
            { "label": "ACE · Seated Shoulder Press", "url": "https://www.acefitness.org/resources/everyone/exercise-library/186/seated-shoulder-press/" }
          ]
        },
        {
          "name": "휴식",
          "prescription": "세트 사이 1분 30초~2분"
        },
        {
          "name": "러닝머신",
          "prescription": "속도 10부터 · 5분",
          "note": "웨이트 루틴을 마친 뒤 진행합니다. 운동이 고됐으므로 러닝은 5분만 타고 쿨다운 해줍니다. 속도는 10을 시작으로, 올릴 수 있을만큼 올려서 진행하고 매주 기록함. 0.1 단위로 입력",
          "guides": [
            { "label": "한국어 쇼츠 · 러닝머신 사용법", "url": "https://www.youtube.com/shorts/K-XRBqckGjU" },
            { "label": "한국어 상세 · 트레드밀 적응과 자세", "url": "https://www.youtube.com/watch?v=h2dJZbcKfto" }
          ]
        }
      ]
    },
    {
      "id": "sun",
      "day": "SUN",
      "ko": "일요일",
      "status": "ready",
      "short": "Pull 데이 · 풀업 {{sundayPullupTarget}}×5",
      "category": "GEAR SECOND · PULL DAY",
      "title": "Pull 데이 + 러닝머신",
      "summary": "맨몸 풀업과 등·이두 운동을 수행하고 러닝머신으로 마무리합니다.",
      "target": "오늘 목표 · 당기기 6종 + 러닝머신 5분",
      "inputs": "운동 날짜 + 맨몸 풀업 5세트 각각의 실제 횟수 + Pull 루틴 완료 체크",
      "completion": true,
      "exercises": [
        {
          "name": "풀업",
          "prescription": "{{sundayPullupTarget}}회 × 5세트",
          "note": "각 세트는 맨몸으로 목표 횟수에 도전합니다. 실패하면 풀업머신으로 전환해 해당 세트 목표를 채웁니다. 5세트 모두 맨몸 성공 시 다음 일요일부터 세트당 1회 증가, 한 세트라도 머신 보조 사용 시 유지합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 풀업 정자세", "url": "https://www.youtube.com/shorts/uQzEmcUjg4I" },
            { "label": "한국어 상세 · 완벽한 풀업 자세", "url": "https://www.youtube.com/watch?v=nWhS28U6bCY" },
            { "label": "NASM · Pull-Up", "url": "https://www.nasm.org/resource-center/exercise-library/pull-up" },
            { "label": "머신 쇼츠 · 어시스트 풀업 사용법", "url": "https://www.youtube.com/shorts/UcNNp8Lna4U" },
            { "label": "머신 상세 · 어시스트 풀업 완벽 가이드", "url": "https://www.youtube.com/watch?v=Otno-bwsnZw" },
            { "label": "ExRx · Machine-assisted Pull-up", "url": "https://exrx.net/WeightExercises/LatissimusDorsi/AsPullupOpen" }
          ]
        },
        {
          "name": "시티드 로우 머신",
          "prescription": "15회 × 5세트",
          "note": "첫 15회 RPE 8 무게를 정하고 매 세트 한 칸씩 증량합니다. 실패하면 증량을 멈추고 남은 세트는 같은 무게로 가능한 최대 횟수까지 진행합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 시티드로우 머신 사용법", "url": "https://www.youtube.com/shorts/K1iMPxJKCn8" },
            { "label": "한국어 상세 · 시티드 로우 머신 자세", "url": "https://www.youtube.com/watch?v=vrjU9T9V86k" },
            { "label": "NASM · Seated Machine Row Close Grip", "url": "https://www.nasm.org/resource-center/exercise-library/seated-machine-row-close-grip" }
          ]
        },
        {
          "name": "스트레이트 암 풀다운",
          "prescription": "10회 × 5세트",
          "note": "첫 15회 RPE 8 무게로 5세트를 진행하며, 실패하면 자세를 유지할 수 있도록 감량하면서 15회를 채웁니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 스트레이트 암 풀다운", "url": "https://www.youtube.com/shorts/HFcBoK17T5A" },
            { "label": "한국어 상세 · 암풀다운 케이블 운동", "url": "https://www.youtube.com/watch?v=Jdyy0GNx4sc" }
          ]
        },
        {
          "name": "티바로우",
          "prescription": "10회 × 5세트",
          "note": "셋업과 자세를 미리 숙지하고 첫 10회 RPE 8 무게로 시작합니다. 실패하면 감량하면서 매 세트 10회를 채웁니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 티바로우 사용법", "url": "https://www.youtube.com/shorts/TP_NxG9kk_w" },
            { "label": "한국어 상세 · 티바로우 자세와 타겟", "url": "https://www.youtube.com/watch?v=q4yZBY0nkSY" }
          ]
        },
        {
          "name": "이두컬 머신 중 아무거나 택해서 진행",
          "prescription": "팔 한쪽당 10회 x 3세트",
          "note": "시작은 RPE 7~8 무게로 시작합니다. 10회에 실패해도 감량 없이 최대 노력으로 수행합니다. ( 안올라가면 6회에 3세트를 마무리해도 됨) 각 팔의 횟수는 동일하게 가져가는 것이 좋기 때문에, 한쪽팔이 더 많이 수행했다면 반대 쪽 팔도 맞춰서 수행해줍니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 암컬 머신 사용법", "url": "https://www.youtube.com/shorts/KqPO9Nx88CA" },
            { "label": "한국어 상세 · 암컬 머신 가이드", "url": "https://www.youtube.com/watch?v=mmOYQ_ww5bA" }
          ]
        },
        {
          "name": "휴식",
          "prescription": "세트 사이 1분 30초~2분"
        },
        {
          "name": "러닝머신",
          "prescription": "속도 7 이상 · 10분",
          "guides": [
            { "label": "한국어 쇼츠 · 러닝머신 자세", "url": "https://www.youtube.com/shorts/KH00qS65gZA" },
            { "label": "한국어 상세 · 트레드밀 적응과 자세", "url": "https://www.youtube.com/watch?v=h2dJZbcKfto" }
          ]
        }
      ]
    }
  ]
}
$program$::jsonb,
  date '2026-09-02',
  'https://app.notion.com/p/3cebe971bff78144884ffe8cc7623006'
);


create or replace function public.get_admin_daily_records(target_date date)
returns table (
  user_id uuid,
  user_email text,
  record_kind text,
  routine_id text,
  workout_type text,
  target_total integer,
  total_reps integer,
  set_count integer,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'email'), '') <> 'mainbbong@gmail.com' then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return query
    select daily_record.*
    from (
      select
        workout.user_id,
        auth_user.email::text as user_email,
        'workout_session'::text as record_kind,
        null::text as routine_id,
        workout.workout_type,
        workout.target_total,
        workout.total_reps,
        workout.set_count,
        workout.updated_at as recorded_at
      from public.workout_sessions as workout
      join auth.users as auth_user on auth_user.id = workout.user_id
      where workout.workout_date = target_date
        and workout.id = (
          select latest.id
          from public.workout_sessions as latest
          where latest.user_id = workout.user_id
            and latest.workout_date = workout.workout_date
            and latest.workout_type = workout.workout_type
          order by coalesce(latest.event_order, 0) desc
          limit 1
        )

      union all

      select
        completion.user_id,
        auth_user.email::text as user_email,
        'routine_completion'::text as record_kind,
        completion.routine_id,
        null::text as workout_type,
        null::integer as target_total,
        null::integer as total_reps,
        null::integer as set_count,
        completion.completed_at as recorded_at
      from public.routine_completions as completion
      join auth.users as auth_user on auth_user.id = completion.user_id
      where completion.workout_date = target_date
        and completion.is_completed is not false
        and completion.id = (
          select latest.id
          from public.routine_completions as latest
          where latest.user_id = completion.user_id
            and latest.workout_date = completion.workout_date
            and latest.routine_id = completion.routine_id
          order by coalesce(latest.event_order, 0) desc
          limit 1
        )
    ) as daily_record
    order by daily_record.recorded_at desc;
end;
$$;
