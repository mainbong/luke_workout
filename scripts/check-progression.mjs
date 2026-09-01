import assert from "node:assert/strict";
import {
  countMissionWorkoutDays,
  nextFiveSetTarget,
  nextPullTarget,
  nextPushTarget,
} from "../src/progression.ts";

assert.equal(nextPushTarget([], 100, 10), 100);
assert.equal(nextPushTarget([{ target_total: 100, total_reps: 100 }], 100, 10), 110);
assert.equal(nextPushTarget([{ target_total: 100, total_reps: 99 }], 100, 10), 100);

assert.equal(nextPullTarget([], 30, 10, 10), 30);
assert.equal(nextPullTarget([{ target_total: 30, total_reps: 30, set_count: 10 }], 30, 10, 10), 40);
assert.equal(nextPullTarget([{ target_total: 30, total_reps: 30, set_count: 11 }], 30, 10, 10), 30);
assert.equal(nextPullTarget([{ target_total: 30, total_reps: 30, set_count: null }], 30, 10, 10), 30);

assert.equal(nextFiveSetTarget([], 15), 15);
assert.equal(nextFiveSetTarget([{ target_total: 15, set_reps: [15, 15, 15, 15, 15] }], 15), 16);
assert.equal(nextFiveSetTarget([{ target_total: 15, set_reps: [15, 15, 14, 15, 15] }], 15), 15);
assert.equal(nextFiveSetTarget([{ target_total: 3, set_reps: [3, 3, 3, 3, 3] }], 3, 2), 5);

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
