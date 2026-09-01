do $$
begin
  if exists (
    select 1
    from public.workout_sessions
    where workout_date >= date '2026-09-02'
      and program_version_id is distinct from 'luke-weekly-2026-09-02'
  ) or exists (
    select 1
    from public.routine_completions
    where workout_date >= date '2026-09-02'
      and program_version_id is distinct from 'luke-weekly-2026-09-02'
  ) then
    raise exception 'Future records exist with a pre-Gear-Second program version'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.workout_sessions
    where workout_type in ('recovery_pushup', 'sunday_pullup')
      and set_reps is null
  ) then
    raise exception 'Existing five-set records are missing set_reps'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.workout_sessions
drop constraint workout_sessions_set_reps_check;

alter table public.workout_sessions
add constraint workout_sessions_set_reps_check
check (
  (workout_type not in ('recovery_pushup', 'sunday_pullup') and set_reps is null)
  or (
    workout_type in ('recovery_pushup', 'sunday_pullup')
    and set_reps is not null
    and cardinality(set_reps) = 5
    and array_position(set_reps, null) is null
    and 0 <= all (set_reps)
  )
);
