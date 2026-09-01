import assert from "node:assert/strict";
import { countMissionWorkoutDays, nextFiveSetTarget } from "../src/progression.ts";

assert.equal(nextFiveSetTarget([], 3), 3);
assert.equal(nextFiveSetTarget([{ target_total: 3, set_reps: [3, 3, 3, 3, 3] }], 3), 4);
assert.equal(nextFiveSetTarget([{ target_total: 3, set_reps: [3, 3, 2, 3, 3] }], 3), 3);

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
