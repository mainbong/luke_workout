create function public.enforce_record_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'Workout record identity is immutable'
      using errcode = '55000';
  end if;

  if tg_table_name = 'workout_sessions'
    and new.workout_type is distinct from old.workout_type then
    raise exception 'Workout type is immutable'
      using errcode = '55000';
  end if;

  if tg_table_name = 'routine_completions'
    and new.routine_id is distinct from old.routine_id then
    raise exception 'Completion routine is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger enforce_workout_session_identity
before update on public.workout_sessions
for each row execute function public.enforce_record_identity();

create trigger enforce_routine_completion_identity
before update on public.routine_completions
for each row execute function public.enforce_record_identity();
