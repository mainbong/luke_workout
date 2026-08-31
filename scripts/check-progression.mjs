import assert from "node:assert/strict";
import { nextFiveSetTarget } from "../src/progression.ts";

assert.equal(nextFiveSetTarget([], 3), 3);
assert.equal(nextFiveSetTarget([{ target_total: 3, set_reps: [3, 3, 3, 3, 3] }], 3), 4);
assert.equal(nextFiveSetTarget([{ target_total: 3, set_reps: [3, 3, 2, 3, 3] }], 3), 3);

console.log("progression checks passed");
