create or replace function public.get_admin_routine_history(target_routine_id text)
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
      where workout.workout_type = case target_routine_id
        when 'mon' then 'recovery_pushup'
        when 'wed' then 'pullup'
        when 'thu' then 'pushup'
        when 'sun' then 'sunday_pullup'
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
