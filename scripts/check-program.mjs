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
  DEFAULT_WORKOUT_PROGRAM_VERSION,
  findProgramVersionForDate,
  findProgramVersionForRecord,
  parseWorkoutProgramVersion,
  renderProgramRoutines,
} = programModule;
const { nextPushTarget } = progressionModule;

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const program = JSON.parse(read("../src/program.json"));
const migration = read("../supabase/migrations/20260901000400_create_workout_program_versions.sql");
const seed = migration.match(/\$program\$\s*([\s\S]*?)\s*\$program\$/);

assert.ok(seed, "migration must contain a $program$ seed");
assert.deepEqual(JSON.parse(seed[1]), program, "migration seed must match src/program.json");
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
