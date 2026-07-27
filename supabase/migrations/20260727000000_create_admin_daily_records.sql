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
    select
      workout.user_id,
      auth_user.email::text,
      'workout_session'::text,
      null::text,
      workout.workout_type,
      workout.target_total,
      workout.total_reps,
      workout.set_count,
      workout.updated_at
    from public.workout_sessions as workout
    join auth.users as auth_user on auth_user.id = workout.user_id
    where workout.workout_date = target_date

    union all

    select
      completion.user_id,
      auth_user.email::text,
      'routine_completion'::text,
      completion.routine_id,
      null::text,
      null::integer,
      null::integer,
      null::integer,
      completion.completed_at
    from public.routine_completions as completion
    join auth.users as auth_user on auth_user.id = completion.user_id
    where completion.workout_date = target_date

    order by recorded_at desc;
end;
$$;

revoke execute on function public.get_admin_daily_records(date) from public;
revoke execute on function public.get_admin_daily_records(date) from anon;
grant execute on function public.get_admin_daily_records(date) to authenticated;
