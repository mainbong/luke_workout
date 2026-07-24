create table public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_date date not null,
  routine_id text not null check (char_length(routine_id) between 1 and 32),
  completed_at timestamptz not null default now(),
  unique (user_id, workout_date, routine_id)
);

alter table public.routine_completions enable row level security;

create policy "Users can read their own routine completions"
on public.routine_completions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own routine completions"
on public.routine_completions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own routine completions"
on public.routine_completions
for delete
to authenticated
using ((select auth.uid()) = user_id);
