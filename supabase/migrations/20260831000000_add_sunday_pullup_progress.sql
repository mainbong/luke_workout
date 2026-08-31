alter table public.workout_sessions
drop constraint workout_sessions_workout_type_check;

alter table public.workout_sessions
add constraint workout_sessions_workout_type_check
check (workout_type in ('pushup', 'pullup', 'recovery_pushup', 'sunday_pullup'));

alter table public.workout_sessions
drop constraint workout_sessions_set_count_check;

alter table public.workout_sessions
add constraint workout_sessions_set_count_check
check (
  (workout_type = 'pushup' and set_count is null)
  or (workout_type = 'pullup' and set_count >= 1)
  or (workout_type in ('recovery_pushup', 'sunday_pullup') and set_count = 5)
);

alter table public.workout_sessions
drop constraint workout_sessions_set_reps_check;

alter table public.workout_sessions
add constraint workout_sessions_set_reps_check
check (
  (workout_type not in ('recovery_pushup', 'sunday_pullup') and set_reps is null)
  or (
    workout_type in ('recovery_pushup', 'sunday_pullup')
    and cardinality(set_reps) = 5
    and array_position(set_reps, null) is null
  )
);
