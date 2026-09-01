import assert from "node:assert/strict";
import {
  countMissionWorkoutDays,
  nextFiveSetTarget,
  nextPlankTarget,
  nextPullTarget,
  nextPushTarget,
} from "../src/progression.ts";

assert.equal(nextPushTarget([], 100, 10), 100);
assert.equal(nextPushTarget([{ target_total: 100, total_reps: 100 }], 100, 10), 110);
assert.equal(nextPushTarget([{ target_total: 100, total_reps: 99 }], 100, 10), 100);
assert.equal(nextPushTarget([{ target_total: 100, total_reps: 100, set_count: 4 }], 100, 10, 20, 4), 120);
assert.equal(nextPushTarget([{ target_total: 100, total_reps: 100, set_count: 5 }], 100, 10, 20, 4), 110);

assert.deepEqual(nextPlankTarget([], 40, 20, 10, 5), { holdSeconds: 40, restSeconds: 20 });
assert.deepEqual(
  nextPlankTarget([{ details: { plank_succeeded: true, plank_hold_seconds: 40, plank_rest_seconds: 20 } }], 40, 20, 10, 5),
  { holdSeconds: 50, restSeconds: 25 },
);
assert.deepEqual(
  nextPlankTarget([{ details: { plank_succeeded: false, plank_hold_seconds: 50, plank_rest_seconds: 25 } }], 40, 20, 10, 5),
  { holdSeconds: 50, restSeconds: 25 },
);

assert.equal(nextPullTarget([], 30, 10, 10), 30);
assert.equal(nextPullTarget([{ target_total: 30, total_reps: 30, set_count: 10 }], 30, 10, 10), 40);
assert.equal(nextPullTarget([{ target_total: 30, total_reps: 30, set_count: 11 }], 30, 10, 10), 30);
assert.equal(nextPullTarget([{ target_total: 30, total_reps: 30, set_count: null }], 30, 10, 10), 30);

assert.equal(nextFiveSetTarget([], 15), 15);
assert.equal(nextFiveSetTarget([{ target_total: 15, set_reps: [15, 15, 15, 15, 15] }], 15), 16);
assert.equal(nextFiveSetTarget([{ target_total: 15, set_reps: [15, 15, 14, 15, 15] }], 15), 15);
assert.equal(nextFiveSetTarget([{ target_total: 3, set_reps: [3, 3, 3, 3, 3] }], 3, 2), 5);
assert.equal(nextFiveSetTarget([{ target_total: 3, set_reps: [3, 3, 2, 3, 3] }], 5), 5);

const workoutRecords = [
  { workout_date: "2026-07-22" },
  { workout_date: "2026-07-23" },
  { workout_date: "2026-07-25" },
  { workout_date: "2026-07-25" },
];
const completionRecords = [
  { workout_date: "2026-07-25" },
  { workout_date: "2026-08-31" },
  { workout_date: "2026-09-01" },
];

assert.equal(
  countMissionWorkoutDays([...workoutRecords, ...completionRecords], "2026-07-23", "2026-08-31"),
  3,
);

console.log("progression checks passed");
