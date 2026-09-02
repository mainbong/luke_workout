import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
let calendarModule;
let programModule;
try {
  calendarModule = await vite.ssrLoadModule("/src/AdminMonthlyPanel.tsx");
  programModule = await vite.ssrLoadModule("/src/program.ts");
} finally {
  await vite.close();
}

const workout = (updated_at) => ({
  id: updated_at,
  workout_date: "2026-09-03",
  workout_type: "pushup",
  program_version_id: "test-version",
  target_total: 100,
  total_reps: 100,
  set_count: 5,
  set_reps: null,
  details: {},
  created_at: updated_at,
  updated_at,
});
const completion = (completed_at) => ({
  id: completed_at,
  workout_date: "2026-09-04",
  routine_id: "fri",
  program_version_id: "test-version",
  details: {},
  completed_at,
});

const records = calendarModule.buildSelfMonthlyRecords(
  [workout("2026-09-03T10:00:00Z")],
  [completion("2026-09-04T10:00:00Z")],
);
assert.equal(records.length, 2);
assert.equal(records[0].record_kind, "workout_session");
assert.equal(records[0].recorded_at, "2026-09-03T10:00:00Z");
assert.equal(records[1].record_kind, "routine_completion");
assert.ok(records.every((record) => !("user_id" in record) && !("user_email" in record)));

const selfMarkup = renderToStaticMarkup(createElement(calendarModule.AdminMonthlyPanel, {
  mode: "self",
  programVersions: programModule.DEFAULT_WORKOUT_PROGRAM_VERSIONS,
  workoutRecords: [],
  completionRecords: [],
  recordsStatus: "ready",
  onRefresh: () => undefined,
}));
assert.match(selfMarkup, /내 운동 달력/);
assert.match(selfMarkup, /aria-label="내 \d{4}년 \d+월 운동 기록 날짜"/);
assert.doesNotMatch(selfMarkup, /가입 사용자|ADMIN MONTHLY VIEW|사용자별 운동 달력/);

const [app, panel, sessionsMigration, completionsMigration, historyMigration] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/AdminMonthlyPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260724000000_create_workout_sessions.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260724030000_create_routine_completions.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260901000800_preserve_record_event_history.sql", import.meta.url), "utf8"),
]);
assert.match(app, /mode="self"[\s\S]*workoutRecords=\{\[\.\.\.pushRecords,[\s\S]*completionRecords=\{completionRecords\}/);
assert.doesNotMatch(app, /mode="self"[\s\S]{0,300}workoutRecords=\{workoutHistory\}/);
assert.match(panel, /if \(isSelf \|\| !supabase\) return;/);
assert.match(sessionsMigration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(completionsMigration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.equal((historyMigration.match(/with \(security_invoker = true\)/g) ?? []).length, 2);

console.log("self calendar checks passed");
