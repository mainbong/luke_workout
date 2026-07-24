alter table public.workout_sessions
drop constraint workout_sessions_set_count_check;

alter table public.workout_sessions
add constraint workout_sessions_set_count_check
check (
  (workout_type = 'pushup' and set_count is null)
  or
  (workout_type = 'pullup' and set_count >= 1)
);
