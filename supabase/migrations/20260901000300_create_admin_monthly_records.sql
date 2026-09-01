create or replace function public.get_admin_monthly_records(target_month date)
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
      monthly_record.target_total,
      monthly_record.total_reps,
      monthly_record.set_count,
      monthly_record.set_reps,
      monthly_record.recorded_at
    from auth.users as auth_user
    left join lateral (
      select
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
      where workout.user_id = auth_user.id
        and workout.workout_date >= month_start
        and workout.workout_date < month_end

      union all

      select
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
      where completion.user_id = auth_user.id
        and completion.workout_date >= month_start
        and completion.workout_date < month_end
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
