import defaultDefinition from "./program.json";

export type Exercise = {
  name: string;
  prescription: string;
  note?: string;
  guides?: { label: string; url: string }[];
};

export type Routine = {
  id: string;
  day: string;
  ko: string;
  status: "pending" | "ready";
  short: string;
  title?: string;
  category?: string;
  summary?: string;
  target?: string;
  record?: string;
  exercises?: Exercise[];
  link?: { label: string; url: string };
};

export type ProgressionRule = {
  routineId: string;
  initialTarget: number;
  increment: number;
  setCount?: number;
  successSetCount?: number;
  success: string;
  failure: "hold";
  scope: "user";
};

export type ProgramDefinition = {
  schemaVersion: 1;
  programKey: string;
  title: string;
  timezone: string;
  cycle: "weekly";
  effectiveFrom: string;
  sourceUrl: string;
  safety: {
    stopWhen: string[];
    disclaimer: string;
  };
  progressions: {
    recovery_pushup: ProgressionRule;
    pushup: ProgressionRule;
    pullup: ProgressionRule;
    sunday_pullup: ProgressionRule;
  };
  days: Routine[];
};

export type WorkoutProgramVersion = {
  id: string;
  program_key: string;
  version: number;
  effective_from: string;
  source_url: string;
  definition: ProgramDefinition;
};

export const DEFAULT_WORKOUT_PROGRAM_VERSION: WorkoutProgramVersion = {
  id: "luke-weekly-2026-07-23",
  program_key: "luke-weekly",
  version: 1,
  effective_from: "2026-07-23",
  source_url: "https://app.notion.com/p/3cebe971bff78173bb47f5ce07a75d78",
  definition: defaultDefinition as ProgramDefinition,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DAY_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function isPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isLink(value: unknown) {
  return isObject(value) && typeof value.label === "string" && typeof value.url === "string";
}

function isExercise(value: unknown) {
  if (!isObject(value) || typeof value.name !== "string" || typeof value.prescription !== "string") {
    return false;
  }
  return (value.note === undefined || typeof value.note === "string")
    && (value.guides === undefined || (Array.isArray(value.guides) && value.guides.every(isLink)));
}

function isRoutine(value: unknown) {
  if (!isObject(value)) return false;
  return typeof value.id === "string"
    && typeof value.day === "string"
    && typeof value.ko === "string"
    && (value.status === "pending" || value.status === "ready")
    && typeof value.short === "string"
    && ["title", "category", "summary", "target", "record"]
      .every((field) => value[field] === undefined || typeof value[field] === "string")
    && (value.exercises === undefined || (Array.isArray(value.exercises) && value.exercises.every(isExercise)))
    && (value.link === undefined || isLink(value.link));
}

function isProgressionRule(value: unknown, routineId: string, success: string) {
  return isObject(value)
    && value.routineId === routineId
    && isPositiveInteger(value.initialTarget)
    && isPositiveInteger(value.increment)
    && value.success === success
    && value.failure === "hold"
    && value.scope === "user";
}

export function isProgramDefinition(value: unknown): value is ProgramDefinition {
  if (!isObject(value) || value.schemaVersion !== 1 || value.cycle !== "weekly") return false;
  if (typeof value.programKey !== "string" || typeof value.title !== "string") return false;
  if (typeof value.timezone !== "string" || typeof value.effectiveFrom !== "string") return false;
  if (typeof value.sourceUrl !== "string" || !isObject(value.safety)) return false;
  if (!Array.isArray(value.safety.stopWhen) || !value.safety.stopWhen.every((item) => typeof item === "string")) return false;
  if (typeof value.safety.disclaimer !== "string" || !isObject(value.progressions)) return false;

  const progressions = value.progressions;
  if (!isProgressionRule(progressions.recovery_pushup, "mon", "all_sets_at_or_above_target")
    || !isObject(progressions.recovery_pushup) || progressions.recovery_pushup.setCount !== 5
    || !isProgressionRule(progressions.pushup, "thu", "total_reps_at_or_above_target")
    || !isObject(progressions.pushup) || progressions.pushup.setCount !== 5
    || !isProgressionRule(progressions.pullup, "sat", "target_completed_at_or_below_set_count")
    || !isObject(progressions.pullup) || !isPositiveInteger(progressions.pullup.successSetCount)
    || !isProgressionRule(progressions.sunday_pullup, "sun", "all_sets_unassisted_at_or_above_target")
    || !isObject(progressions.sunday_pullup) || progressions.sunday_pullup.setCount !== 5) return false;
  const days = value.days;
  if (!Array.isArray(days) || days.length !== 7 || !days.every(isRoutine)) return false;
  return DAY_IDS.every((id) => days.some((day) => isObject(day) && day.id === id));
}

export function parseWorkoutProgramVersion(value: unknown): WorkoutProgramVersion | null {
  if (!isObject(value)
    || typeof value.id !== "string"
    || typeof value.program_key !== "string"
    || !isPositiveInteger(value.version)
    || typeof value.effective_from !== "string"
    || typeof value.source_url !== "string"
    || !isProgramDefinition(value.definition)
    || value.program_key !== value.definition.programKey
    || value.effective_from !== value.definition.effectiveFrom
    || value.source_url !== value.definition.sourceUrl) {
    return null;
  }
  return value as WorkoutProgramVersion;
}

export function findProgramVersionForDate(
  versions: readonly WorkoutProgramVersion[],
  workoutDate: string,
): WorkoutProgramVersion | null {
  let latest: WorkoutProgramVersion | null = null;
  for (const version of versions) {
    if (version.effective_from <= workoutDate
      && (!latest
        || version.effective_from > latest.effective_from
        || (version.effective_from === latest.effective_from && version.version > latest.version))) {
      latest = version;
    }
  }
  return latest;
}

export function findProgramVersionForRecord(
  versions: readonly WorkoutProgramVersion[],
  record: { program_version_id: string | null; workout_date: string },
): WorkoutProgramVersion | null {
  return record.program_version_id
    ? versions.find((version) => version.id === record.program_version_id) ?? null
    : findProgramVersionForDate(versions, record.workout_date);
}

function interpolate(value: unknown, variables: Record<string, string | number>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) =>
      variables[key] === undefined ? placeholder : String(variables[key]));
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, variables));
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolate(item, variables)]));
  }
  return value;
}

export function renderProgramRoutines(
  definition: ProgramDefinition,
  variables: Record<string, string | number>,
) {
  return interpolate(definition.days, variables) as Routine[];
}
