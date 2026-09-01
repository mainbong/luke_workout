import type {
  RoutineCompletion,
  RoutineCompletionEvent,
  WorkoutSession,
  WorkoutSessionEvent,
} from "./supabase";

export function currentWorkoutSessions(events: WorkoutSessionEvent[]): WorkoutSession[] {
  return events.filter((event) => event.is_current);
}

export function currentRoutineCompletions(events: RoutineCompletionEvent[]): RoutineCompletion[] {
  return events.filter((event) => event.is_current && event.is_completed);
}
