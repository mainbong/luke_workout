import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
let adminCalendar;
try {
  adminCalendar = await vite.ssrLoadModule("/src/adminCalendar.ts");
} finally {
  await vite.close();
}
const {
  buildMonthCells,
  recordOutcome,
  recordState,
  routineIdForDate,
  seoulMonthValue,
  shiftMonth,
} = adminCalendar;

assert.equal(seoulMonthValue(new Date("2026-01-31T14:59:59Z")), "2026-01");
assert.equal(seoulMonthValue(new Date("2026-01-31T15:00:00Z")), "2026-02");
assert.equal(shiftMonth("2026-12", 1), "2027-01");
assert.equal(shiftMonth("2026-01", -1), "2025-12");

const september = buildMonthCells("2026-09");
assert.equal(september.length, 42);
assert.deepEqual(september.slice(0, 3), [null, null, { date: "2026-09-01", day: 1 }]);
assert.deepEqual(september[31], { date: "2026-09-30", day: 30 });
assert.ok(september.slice(32).every((cell) => cell === null));

assert.deepEqual(
  Array.from({ length: 7 }, (_, day) => routineIdForDate(`2026-09-${String(day + 6).padStart(2, "0")}`)),
  ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
);

const programVersion = {
  id: "v1",
  version: 1,
  definition: {
    progressions: {
      recovery_pushup: { increment: 1 },
      pushup: { increment: 10 },
      pullup: { increment: 10, successSetCount: 10 },
      sunday_pullup: { increment: 1 },
    },
  },
};
const versions = [{
  ...programVersion,
  id: "v2",
  version: 2,
  definition: {
    ...programVersion.definition,
    progressions: {
      ...programVersion.definition.progressions,
      pullup: { increment: 20, successSetCount: 5 },
    },
  },
}, programVersion];
const record = (workout_type, values = {}) => ({
  workout_date: "2026-09-01",
  record_kind: "workout_session",
  workout_type,
  program_version_id: "v1",
  target_total: 10,
  total_reps: null,
  set_count: null,
  set_reps: null,
  ...values,
});

const recoveryPr = record("recovery_pushup", { set_reps: [10, 10, 10, 10, 10] });
assert.equal(recordOutcome(recoveryPr, versions).state, "pr");
assert.equal(recordOutcome(record("recovery_pushup", { set_reps: [10, 10, 9, 10, 10] }), versions).state, "performed");
assert.equal(recordOutcome(record("pushup", { total_reps: 10 }), versions).state, "pr");
assert.equal(recordOutcome(record("pushup", { total_reps: 9 }), versions).state, "performed");
const versionedPullPr = recordOutcome(record("pullup", { total_reps: 10, set_count: 10 }), versions);
assert.equal(versionedPullPr.state, "pr");
assert.equal(versionedPullPr.programVersion?.id, "v1");
assert.equal(recordOutcome(record("pullup", { total_reps: 9, set_count: 10 }), versions).state, "performed");
assert.equal(recordOutcome(record("pullup", { total_reps: 10, set_count: 11 }), versions).state, "performed");
assert.equal(recordOutcome(record("sunday_pullup", { set_reps: [10, 10, 10, 10, 10] }), versions).state, "pr");
assert.equal(recordOutcome(record("sunday_pullup", { set_reps: [10, 10, 10, 10, 9] }), versions).state, "performed");
const legacy = recordOutcome(record("pushup", { program_version_id: null, total_reps: 10 }), versions);
assert.equal(legacy.state, "performed");
assert.equal(legacy.programVersion, null);
const unknown = recordOutcome(record("pushup", { program_version_id: "unknown", total_reps: 10 }), versions);
assert.equal(unknown.state, "performed");
assert.equal(unknown.programVersion, null);
assert.equal(recordOutcome({ ...record(null), record_kind: "routine_completion" }, versions).state, "performed");

assert.equal(recordState([], versions), "none");
assert.equal(recordState([record("pushup", { total_reps: 9 })], versions), "performed");
assert.equal(recordState([record("pushup", { total_reps: 9 }), recoveryPr], versions), "pr");

console.log("admin calendar checks passed");
