import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentRoutineCompletions, currentWorkoutSessions } from "../src/recordEvents.ts";
import { nextPullTarget, nextPushTarget } from "../src/progression.ts";

const before = {
  id: "00000000-0000-0000-0000-000000000001",
  workout_date: "2026-09-03",
  workout_type: "pushup",
  program_version_id: "gear-v2",
  target_total: 100,
  total_reps: 90,
  set_count: 5,
  set_reps: null,
  details: {},
  created_at: "2026-09-03T01:00:00Z",
  updated_at: "2026-09-03T01:00:00Z",
  event_order: 1,
  is_current: false,
};
const after = {
  ...before,
  id: "00000000-0000-0000-0000-000000000002",
  total_reps: 100,
  set_count: 4,
  updated_at: "2026-09-03T02:00:00Z",
  event_order: 2,
  is_current: true,
};
const workoutHistory = [after, before];
const currentWorkouts = currentWorkoutSessions(workoutHistory);
assert.equal(workoutHistory.length, 2, "same-date before and after events must both remain visible");
assert.deepEqual(currentWorkouts.map(({ id }) => id), [after.id]);
assert.equal(nextPushTarget(currentWorkouts, 100, 10, 20, 4), 120);

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const legacyProgram = JSON.parse(read("../src/program.json"));
const gearSecondProgram = JSON.parse(read("../src/program-gear-second.json"));
const legacyPullup = {
  ...before,
  id: "00000000-0000-0000-0000-000000000006",
  workout_date: "2026-08-29",
  workout_type: "pullup",
  program_version_id: "legacy-v1",
  target_total: 30,
  total_reps: 30,
  set_count: 10,
  updated_at: "2026-08-29T01:00:00Z",
  is_current: true,
};
assert.equal(legacyProgram.progressions.pullup.routineId, "sat");
assert.equal(gearSecondProgram.progressions.pullup.routineId, "wed");
assert.equal(nextPullTarget(
  currentWorkoutSessions([legacyPullup]).filter(({ workout_date, workout_type }) =>
    workout_type === "pullup" && workout_date < gearSecondProgram.effectiveFrom),
  gearSecondProgram.progressions.pullup.initialTarget,
  legacyProgram.progressions.pullup.increment,
  legacyProgram.progressions.pullup.successSetCount,
), 40);

const completed = {
  id: "00000000-0000-0000-0000-000000000003",
  workout_date: "2026-09-05",
  routine_id: "fri",
  program_version_id: "gear-v2",
  details: {},
  completed_at: "2026-09-05T01:00:00Z",
  event_order: 3,
  is_completed: true,
  is_current: false,
};
const cancelled = {
  ...completed,
  id: "00000000-0000-0000-0000-000000000004",
  completed_at: "2026-09-05T02:00:00Z",
  event_order: 4,
  is_completed: false,
  is_current: true,
};
const completionHistory = [cancelled, completed];
assert.equal(completionHistory.length, 2, "completion and cancellation events must both remain visible");
assert.deepEqual(currentRoutineCompletions(completionHistory), []);

const recompleted = {
  ...completed,
  id: "00000000-0000-0000-0000-000000000005",
  completed_at: "2026-09-05T03:00:00Z",
  event_order: 5,
  is_current: true,
};
assert.deepEqual(
  currentRoutineCompletions([recompleted, { ...cancelled, is_current: false }, completed]).map(({ id }) => id),
  [recompleted.id],
);

const migration = readFileSync(
  new URL("../supabase/migrations/20260901000800_preserve_record_event_history.sql", import.meta.url),
  "utf8",
);
const lineageMigration = read("../supabase/migrations/20260902000000_map_admin_routine_history_by_lineage.sql");
const workoutMappingSql = lineageMigration.match(
  /where workout\.workout_type = case target_routine_id([\s\S]*?)\n\s*end/,
)?.[1];
assert.ok(workoutMappingSql, "admin workout lineage mapping is required");
assert.deepEqual(
  Object.fromEntries([...workoutMappingSql.matchAll(/when '(\w+)' then '(\w+)'/g)]
    .map(([, routineId, workoutType]) => [routineId, workoutType])),
  { mon: "recovery_pushup", wed: "pullup", thu: "pushup", sun: "sunday_pullup" },
);
assert.match(lineageMigration, /where completion\.routine_id = target_routine_id/);
assert.doesNotMatch(lineageMigration, /extract\s*\(\s*dow\s+from workout\.workout_date\s*\)/i);
assert.doesNotMatch(
  lineageMigration,
  /\b(?:update|delete)\s+public\.(?:workout_sessions|routine_completions)\b/i,
);
assert.match(migration, /drop constraint workout_sessions_user_id_workout_date_workout_type_key/);
assert.match(migration, /drop constraint routine_completions_user_id_workout_date_routine_id_key/);
assert.match(migration, /new\.event_order := nextval\('public\.record_event_order_seq'/);
assert.match(migration, /pg_advisory_xact_lock/g);
assert.match(migration, /with \(security_invoker = true\)[\s\S]*with \(security_invoker = true\)/);
assert.match(migration, /order by coalesce\(event\.event_order, 0\) desc/g);
assert.match(migration, /coalesce\(event\.is_completed, true\) as is_completed/);
assert.match(migration, /Cancellation must preserve the completed result details/);
assert.match(migration, /drop policy "Users can update their own workout sessions"[\s\S]*drop policy "Users can delete their own routine completions"/);
assert.match(
  migration,
  /revoke all on public\.workout_sessions, public\.routine_completions\s+from public, anon, authenticated;/,
);
assert.match(
  migration,
  /grant select, insert on public\.workout_sessions, public\.routine_completions\s+to authenticated;/,
);
assert.match(migration, /create trigger block_workout_session_event_mutation/);
assert.match(migration, /create trigger block_routine_completion_event_mutation/);
assert.match(migration, /Workout record events are append-only/);
assert.match(migration, /order by coalesce\(latest\.event_order, 0\) desc/g);

console.log("record event checks passed");
