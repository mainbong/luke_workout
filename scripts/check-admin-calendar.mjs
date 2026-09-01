import assert from "node:assert/strict";
import {
  buildMonthCells,
  recordState,
  routineIdForDate,
  seoulMonthValue,
  shiftMonth,
} from "../src/adminCalendar.ts";

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

assert.equal(recordState([]), "none");
assert.equal(recordState([{ record_kind: "workout_session" }]), "result");
assert.equal(recordState([{ record_kind: "routine_completion" }]), "completion");
assert.equal(recordState([
  { record_kind: "routine_completion" },
  { record_kind: "workout_session" },
]), "both");

console.log("admin calendar checks passed");
