alter table public.workout_sessions
add column set_count integer;

alter table public.workout_sessions
add constraint workout_sessions_set_count_check
check (
  (workout_type = 'pushup' and set_count is null)
  or
  (workout_type = 'pullup' and set_count between 1 and 10)
);
