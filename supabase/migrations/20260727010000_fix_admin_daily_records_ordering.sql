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
    ) as daily_record
    order by daily_record.recorded_at desc;
end;
$$;
