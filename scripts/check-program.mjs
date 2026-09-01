import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
let programModule;
let progressionModule;
try {
  programModule = await vite.ssrLoadModule("/src/program.ts");
  progressionModule = await vite.ssrLoadModule("/src/progression.ts");
} finally {
  await vite.close();
}
const {
  DEFAULT_WORKOUT_PROGRAM_VERSIONS,
  DEFAULT_WORKOUT_PROGRAM_VERSION,
  GEAR_SECOND_WORKOUT_PROGRAM_VERSION,
  findProgramVersionForDate,
  findProgramVersionForRecord,
  isGearSecondDate,
  parseWorkoutProgramVersion,
  renderProgramRoutines,
} = programModule;
const { nextPushTarget } = progressionModule;

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const program = JSON.parse(read("../src/program.json"));
const gearSecond = JSON.parse(read("../src/program-gear-second.json"));
const migration = read("../supabase/migrations/20260901000400_create_workout_program_versions.sql");
const gearMigration = read("../supabase/migrations/20260901000500_launch_gear_second_v2.sql");
const eventMigration = read("../supabase/migrations/20260901000800_preserve_record_event_history.sql");
const identityMigration = read("../supabase/migrations/20260901000600_harden_record_identity.sql");
const fiveSetMigration = read("../supabase/migrations/20260901000700_require_complete_five_set_records.sql");
const seed = migration.match(/\$program\$\s*([\s\S]*?)\s*\$program\$/);

assert.ok(seed, "migration must contain a $program$ seed");
assert.deepEqual(JSON.parse(seed[1]), program, "migration seed must match src/program.json");
const gearSeed = eventMigration.match(/\$program\$\s*([\s\S]*?)\s*\$program\$/);
assert.ok(gearSeed, "Gear Second migration must contain a $program$ seed");
assert.deepEqual(JSON.parse(gearSeed[1]), gearSecond, "canonical Gear Second migration seed must match its source JSON");
assert.match(migration, /workout_program_versions_metadata_check[\s\S]*?is not distinct from/, "outer and JSON metadata must match");
assert.match(migration, /New workout records require a program version/, "new records must reject an explicit null version");
assert.match(migration, /Workout record program version is immutable/, "record provenance must be immutable");
assert.match(
  migration,
  /if tg_op = 'INSERT' then[\s\S]*?Program version is not active for workout date[\s\S]*?else[\s\S]*?new\.program_version_id is distinct from old\.program_version_id[\s\S]*?new\.workout_date is distinct from old\.workout_date[\s\S]*?Workout record date is immutable[\s\S]*?end if;\s*return new;/,
  "active-version checks are insert-only and record date/provenance are immutable on update",
);
assert.match(
  migration,
  /drop function public\.get_admin_monthly_records\(date\);[\s\S]*?returns table \([\s\S]*?program_version_id text[\s\S]*?workout\.program_version_id[\s\S]*?completion\.program_version_id/,
  "the monthly admin RPC must expose exact workout and completion provenance",
);
assert.ok(
  migration.indexOf("add column program_version_id") < migration.indexOf("alter column program_version_id set default"),
  "legacy rows must be added before the default is enabled for new rows",
);
assert.equal(program.schemaVersion, 1);
assert.deepEqual(program.days.map(({ id }) => id), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
assert.deepEqual(program.days.map(({ exercises }) => exercises.length), [2, 1, 6, 4, 2, 5, 5]);
assert.deepEqual(program.progressions, {
  recovery_pushup: {
    routineId: "mon",
    initialTarget: 15,
    increment: 1,
    setCount: 5,
    success: "all_sets_at_or_above_target",
    failure: "hold",
    scope: "user",
  },
  pushup: {
    routineId: "thu",
    initialTarget: 100,
    increment: 10,
    setCount: 5,
    success: "total_reps_at_or_above_target",
    failure: "hold",
    scope: "user",
  },
  pullup: {
    routineId: "sat",
    initialTarget: 30,
    increment: 10,
    successSetCount: 10,
    success: "target_completed_at_or_below_set_count",
    failure: "hold",
    scope: "user",
  },
  sunday_pullup: {
    routineId: "sun",
    initialTarget: 3,
    increment: 1,
    setCount: 5,
    success: "all_sets_unassisted_at_or_above_target",
    failure: "hold",
    scope: "user",
  },
});

assert.ok(parseWorkoutProgramVersion(GEAR_SECOND_WORKOUT_PROGRAM_VERSION), "production parser must accept canonical Gear Second");
assert.equal(GEAR_SECOND_WORKOUT_PROGRAM_VERSION.id, "luke-weekly-2026-09-02-canonical");
assert.deepEqual(DEFAULT_WORKOUT_PROGRAM_VERSIONS.map(({ version }) => version), [3, 1]);
assert.equal(findProgramVersionForDate(DEFAULT_WORKOUT_PROGRAM_VERSIONS, "2026-09-01")?.version, 1);
assert.equal(findProgramVersionForDate(DEFAULT_WORKOUT_PROGRAM_VERSIONS, "2026-09-02")?.version, 3);
assert.equal(isGearSecondDate("2026-09-01"), false);
assert.equal(isGearSecondDate("2026-09-02"), true);
assert.deepEqual(gearSecond.days.map(({ id }) => id), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
assert.ok(gearSecond.days.every(({ inputs }) => typeof inputs === "string" && inputs.length > 0), "all v2 days declare inputs");
assert.deepEqual(gearSecond.days.filter(({ completion }) => completion).map(({ id }) => id), ["mon", "tue", "fri", "sat", "sun"]);
assert.equal(gearSecond.progressions.pullup.routineId, "wed");
assert.equal(gearSecond.progressions.pushup.earlySuccessSetCount, 4);
assert.equal(gearSecond.progressions.pushup.earlyIncrement, 20);
assert.deepEqual(gearSecond.progressions.plank, {
  routineId: "thu",
  initialHoldSeconds: 40,
  initialRestSeconds: 20,
  holdIncrementSeconds: 10,
  restIncrementSeconds: 5,
  setCount: 3,
  success: "all_sets_completed",
  failure: "hold",
  scope: "user",
});
assert.equal(gearSecond.progressions.sunday_pullup.initialTarget, 5);
const gearLinks = gearSecond.days.flatMap((day) => [
  ...(day.link ? [day.link.url] : []),
  ...day.exercises.flatMap((exercise) => exercise.guides?.map(({ url }) => url) ?? []),
]);
assert.equal(gearLinks.length, 59, "Gear Second must contain all 59 guide links");
assert.equal(new Set(gearLinks).size, 50, "Gear Second guide link reuse changed");
const straightArm = gearSecond.days.find(({ id }) => id === "sun").exercises.find(({ name }) => name === "스트레이트 암 풀다운");
assert.equal(straightArm.prescription, "10회 × 5세트");
assert.match(straightArm.note, /15회/, "the documented 10/15 rep conflict must remain visible");
const gearSaturday = gearSecond.days.find(({ id }) => id === "sat");
const gearSunday = gearSecond.days.find(({ id }) => id === "sun");
assert.match(gearSaturday.target, /6종/, "the documented Saturday 6/7 exercise conflict must remain visible");
assert.equal(gearSaturday.exercises.slice(0, 7).length, 7);
assert.match(gearSunday.target, /5분/, "the documented Sunday 5/10 minute conflict must remain visible");
assert.equal(gearSunday.exercises.find(({ name }) => name === "러닝머신").prescription, "속도 7 이상 · 10분");
assert.equal(
  gearSecond.days.find(({ id }) => id === "wed").exercises[2].note,
  "예: 5, 5, 3, 3, 3, 3, 2, 2, 2, 2 = 총 30회, 10세트 성공.",
  "canonical explanatory text changed",
);
assert.match(eventMigration, /'luke-weekly-2026-09-02-canonical'[\s\S]*?\n  3,[\s\S]*?\$program\$/);
assert.match(gearMigration, /add column details jsonb not null default '\{\}'::jsonb/g);
assert.match(gearMigration, /workout_type = 'pushup' and \(set_count is null or set_count between 1 and 5\)/);
assert.match(gearMigration, /0 <= all \(set_reps\)/, "five-set results must reject negative reps at the database boundary");
assert.match(gearMigration, /alter column program_version_id drop default/g);
assert.match(gearMigration, /Users can update their own routine completions/);
assert.match(gearMigration, /create or replace function public\.enforce_record_program_version\(\)[\s\S]*?treadmill_speed[\s\S]*?plank_succeeded[\s\S]*?dips_max_reps/, "Gear Second inputs must be validated by the record trigger");
assert.match(gearMigration, /expected_dow[\s\S]*?Workout type does not match the Gear Second weekday[\s\S]*?Completion routine does not match the Gear Second weekday/, "Gear Second records must match their weekday");
assert.match(gearMigration, /details jsonb[\s\S]*?get_admin_monthly_records/);
assert.match(identityMigration, /Workout record identity is immutable[\s\S]*?Workout type is immutable[\s\S]*?Completion routine is immutable/);
assert.match(identityMigration, /before update on public\.workout_sessions[\s\S]*?before update on public\.routine_completions/);
assert.match(fiveSetMigration, /Future records exist with a pre-Gear-Second program version/);
assert.match(fiveSetMigration, /Existing five-set records are missing set_reps/);
assert.match(fiveSetMigration, /set_reps is not null[\s\S]*?cardinality\(set_reps\) = 5[\s\S]*?0 <= all \(set_reps\)/);

const storedVersion = { ...DEFAULT_WORKOUT_PROGRAM_VERSION, definition: program };
const parsedVersion = parseWorkoutProgramVersion(storedVersion);
assert.ok(parsedVersion, "production parser must accept the seeded program");

const fallsBack = (message, mutate) => {
  const malformed = structuredClone(storedVersion);
  mutate(malformed);
  const parsed = parseWorkoutProgramVersion(malformed);
  assert.equal(parsed, null, message);
  assert.equal(parsed ?? DEFAULT_WORKOUT_PROGRAM_VERSION, DEFAULT_WORKOUT_PROGRAM_VERSION, `${message} fallback`);
};

fallsBack("unknown day ID must be rejected", (value) => { value.definition.days[0].id = "unknown"; });
fallsBack("invalid render field type must be rejected", (value) => { value.definition.days[0].title = 42; });
fallsBack("non-finite progression target must be rejected", (value) => {
  value.definition.progressions.pushup.initialTarget = Infinity;
});
fallsBack("negative progression increment must be rejected", (value) => {
  value.definition.progressions.pushup.increment = -1;
});
fallsBack("zero progression increment must be rejected", (value) => {
  value.definition.progressions.pushup.increment = 0;
});
fallsBack("mismatched progression routine must be rejected", (value) => {
  value.definition.progressions.pushup.routineId = "mon";
});
fallsBack("invalid optional successSetCount must be rejected", (value) => {
  value.definition.progressions.pullup.successSetCount = "10";
});
fallsBack("mismatched outer metadata must be rejected", (value) => {
  value.effective_from = "2026-08-01";
});

const augDefinition = structuredClone(parsedVersion.definition);
augDefinition.effectiveFrom = "2026-08-01";
augDefinition.progressions.pushup.increment = 20;
const datedVersions = [
  { ...parsedVersion, id: "aug-v2", version: 2, effective_from: "2026-08-01", definition: augDefinition },
  { ...parsedVersion, id: "jul-v1", version: 1, effective_from: "2026-07-23" },
  { ...parsedVersion, id: "aug-v3", version: 3, effective_from: "2026-08-01", definition: augDefinition },
];
assert.equal(findProgramVersionForDate(datedVersions, "2026-07-22"), null);
assert.equal(findProgramVersionForDate(datedVersions, "2026-07-23")?.id, "jul-v1");
assert.equal(findProgramVersionForDate(datedVersions, "2026-09-01")?.id, "aug-v3");
assert.equal(
  findProgramVersionForRecord(datedVersions, { program_version_id: "jul-v1", workout_date: "2026-09-01" })?.id,
  "jul-v1",
  "stored record version must win over the date-active version",
);
assert.equal(
  findProgramVersionForRecord(datedVersions, { program_version_id: null, workout_date: "2026-09-01" })?.id,
  "aug-v3",
  "legacy records without provenance use the date-active version",
);
assert.equal(
  findProgramVersionForRecord(datedVersions, { program_version_id: "missing-v9", workout_date: "2026-09-01" }),
  null,
  "an explicit unknown version must never fall back to the date-active version",
);
const previousPushRecord = {
  program_version_id: "jul-v1",
  workout_date: "2026-07-30",
  target_total: 100,
  total_reps: 100,
};
const previousPushRule = findProgramVersionForRecord(datedVersions, previousPushRecord).definition.progressions.pushup;
assert.equal(
  nextPushTarget([previousPushRecord], augDefinition.progressions.pushup.initialTarget, previousPushRule.increment),
  110,
  "the prior record snapshot rule governs the transition across a version boundary",
);

const rest = {
  mon: ["세트 간 휴식", "1분 30초 ~ 2분 30초"],
  tue: ["휴식", "운동 없음"],
  wed: ["세트 간 휴식", "1분 30초 ~ 2분"],
  thu: ["2. 세트 사이", "1분 30초"],
  fri: ["동작 간 휴식", "15초"],
  sat: ["2. 세트 수행과 휴식", "철봉에서 내려오면 1분 30초"],
};

for (const [dayId, [name, prescription]] of Object.entries(rest)) {
  const exercise = program.days.find(({ id }) => id === dayId)?.exercises.find((item) => item.name === name);
  assert.equal(exercise?.prescription, prescription, `${dayId} rest prescription changed`);
}

const links = program.days.flatMap((day) => [
  ...(day.link ? [day.link.url] : []),
  ...day.exercises.flatMap((exercise) => exercise.guides?.map(({ url }) => url) ?? []),
]);
assert.equal(links.length, 21, "expected exactly 21 guide/top-level URLs");
assert.equal(new Set(links).size, 21, "guide/top-level URLs must be unique");
for (const link of links) assert.equal(new URL(link).protocol, "https:", `invalid URL: ${link}`);

const placeholders = {
  recoveryPushTarget: program.progressions.recovery_pushup.initialTarget,
  pushTarget: program.progressions.pushup.initialTarget,
  nextPushTarget: program.progressions.pushup.initialTarget + program.progressions.pushup.increment,
  pullTarget: program.progressions.pullup.initialTarget,
  nextPullTarget: program.progressions.pullup.initialTarget + program.progressions.pullup.increment,
  sundayPullupTarget: program.progressions.sunday_pullup.initialTarget,
};
const rendered = { ...program, days: renderProgramRoutines(parsedVersion.definition, placeholders) };
assert.doesNotMatch(JSON.stringify(rendered), /\{\{[^{}]+\}\}/, "unresolved placeholder");
const renderedGear = renderProgramRoutines(GEAR_SECOND_WORKOUT_PROGRAM_VERSION.definition, {
  recoveryPushTarget: 15,
  pushTarget: 100,
  nextPushTarget: 110,
  nextPushEarlyTarget: 120,
  pullTarget: 30,
  nextPullTarget: 40,
  sundayPullupTarget: 5,
  plankHoldSeconds: 40,
  plankRestSeconds: 20,
  nextPlankHoldSeconds: 50,
  nextPlankRestSeconds: 25,
});
assert.doesNotMatch(JSON.stringify(renderedGear), /\{\{[^{}]+\}\}/, "unresolved Gear Second placeholder");

const requiredString = (object, field, path) => {
  assert.equal(typeof object[field], "string", `${path}.${field} must be a string`);
  assert.ok(object[field].trim(), `${path}.${field} must not be empty`);
};

for (const field of ["programKey", "title", "timezone", "cycle", "effectiveFrom", "sourceUrl"])
  requiredString(rendered, field, "program");
assert.ok(Array.isArray(rendered.safety.stopWhen) && rendered.safety.stopWhen.length > 0, "safety.stopWhen required");
requiredString(rendered.safety, "disclaimer", "safety");

for (const [dayIndex, day] of rendered.days.entries()) {
  const path = `days[${dayIndex}]`;
  for (const field of ["id", "day", "ko", "status", "short", "category", "title", "summary", "target"])
    requiredString(day, field, path);
  assert.ok(Array.isArray(day.exercises) && day.exercises.length > 0, `${path}.exercises required`);
  if (day.link) {
    requiredString(day.link, "label", `${path}.link`);
    requiredString(day.link, "url", `${path}.link`);
  }
  for (const [exerciseIndex, exercise] of day.exercises.entries()) {
    const exercisePath = `${path}.exercises[${exerciseIndex}]`;
    requiredString(exercise, "name", exercisePath);
    requiredString(exercise, "prescription", exercisePath);
    if ("note" in exercise) requiredString(exercise, "note", exercisePath);
    if (exercise.guides) {
      assert.ok(Array.isArray(exercise.guides) && exercise.guides.length > 0, `${exercisePath}.guides invalid`);
      for (const [guideIndex, guide] of exercise.guides.entries()) {
        requiredString(guide, "label", `${exercisePath}.guides[${guideIndex}]`);
        requiredString(guide, "url", `${exercisePath}.guides[${guideIndex}]`);
      }
    }
  }
}

const saturdayTreadmill = program.days.find(({ id }) => id === "sat")?.exercises.find(({ name }) => name === "러닝머신");
assert.equal(saturdayTreadmill?.prescription, "속도 10 이상 · 10분", "Saturday treadmill must be speed 10+ for 10 minutes");

console.log("program checks passed");
