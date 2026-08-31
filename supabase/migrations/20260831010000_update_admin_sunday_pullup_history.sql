create or replace function public.get_admin_routine_history(target_routine_id text)
returns table (
  user_id uuid,
  user_email text,
  workout_date date,
  record_kind text,
  routine_id text,
  workout_type text,
  target_total integer,
  total_reps integer,
  set_count integer,
  set_reps integer[],
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

  if target_routine_id not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') then
    raise exception 'Invalid routine id'
      using errcode = '22023';
  end if;

  return query
    select history_record.*
    from (
      select
        workout.user_id,
        auth_user.email::text as user_email,
        workout.workout_date,
        'workout_session'::text as record_kind,
        null::text as routine_id,
        workout.workout_type,
        workout.target_total,
        workout.total_reps,
        workout.set_count,
        workout.set_reps,
        workout.updated_at as recorded_at
      from public.workout_sessions as workout
      join auth.users as auth_user on auth_user.id = workout.user_id
      where workout.workout_type = case target_routine_id
        when 'mon' then 'recovery_pushup'
        when 'thu' then 'pushup'
        when 'sat' then 'pullup'
        when 'sun' then 'sunday_pullup'
        else '__none__'
      end

      union all

      select
        completion.user_id,
        auth_user.email::text as user_email,
        completion.workout_date,
        'routine_completion'::text as record_kind,
        completion.routine_id,
        null::text as workout_type,
        null::integer as target_total,
        null::integer as total_reps,
        null::integer as set_count,
        null::integer[] as set_reps,
        completion.completed_at as recorded_at
      from public.routine_completions as completion
      join auth.users as auth_user on auth_user.id = completion.user_id
      where completion.routine_id = target_routine_id
        and target_routine_id not in ('mon', 'thu', 'sat')
    ) as history_record
    order by history_record.workout_date desc, history_record.recorded_at desc;
end;
$$;

revoke execute on function public.get_admin_routine_history(text) from public;
revoke execute on function public.get_admin_routine_history(text) from anon;
grant execute on function public.get_admin_routine_history(text) to authenticated;
