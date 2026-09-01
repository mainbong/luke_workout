import { findProgramVersionForRecord, type WorkoutProgramVersion } from "./program";
import { nextFiveSetTarget, nextPullTarget, nextPushTarget } from "./progression";

const ROUTINE_IDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type AchievementRecord = {
  workout_date: string;
  record_kind: "workout_session" | "routine_completion";
  workout_type: "pushup" | "pullup" | "recovery_pushup" | "sunday_pullup" | null;
  program_version_id: string | null;
  target_total: number | null;
  total_reps: number | null;
  set_count: number | null;
  set_reps: number[] | null;
};

export type RecordOutcome = {
  state: "performed" | "pr";
  programVersion: WorkoutProgramVersion | null;
};

function parseMonth(monthValue: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthValue);
  if (!match) throw new RangeError(`Invalid month: ${monthValue}`);
  return [Number(match[1]), Number(match[2])] as const;
}

export function seoulMonthValue(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month") => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}`;
}

export function shiftMonth(monthValue: string, amount: number): string {
  const [year, month] = parseMonth(monthValue);
  if (!Number.isInteger(amount)) throw new RangeError(`Invalid month shift: ${amount}`);
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthCells(monthValue: string): Array<{ date: string; day: number } | null> {
  const [year, month] = parseMonth(monthValue);
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day < 1 || day > daysInMonth
      ? null
      : { date: `${monthValue}-${String(day).padStart(2, "0")}`, day };
  });
}

export function routineIdForDate(dateValue: string): "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (date.toISOString().slice(0, 10) !== dateValue) throw new RangeError(`Invalid date: ${dateValue}`);
  return ROUTINE_IDS[date.getUTCDay()];
}

export function recordOutcome(
  record: AchievementRecord,
  programVersions: readonly WorkoutProgramVersion[],
): RecordOutcome {
  const programVersion = record.program_version_id
    ? findProgramVersionForRecord(programVersions, record)
    : null;
  if (record.record_kind === "routine_completion"
    || !programVersion
    || !record.workout_type
    || record.target_total === null) {
    return { state: "performed", programVersion };
  }

  const rule = programVersion.definition.progressions[record.workout_type];
  let nextTarget = record.target_total;
  if (record.workout_type === "pushup" && record.total_reps !== null) {
    nextTarget = nextPushTarget(
      [{ target_total: record.target_total, total_reps: record.total_reps }],
      record.target_total,
      rule.increment,
    );
  } else if (record.workout_type === "pullup" && record.total_reps !== null) {
    nextTarget = nextPullTarget(
      [{ target_total: record.target_total, total_reps: record.total_reps, set_count: record.set_count }],
      record.target_total,
      rule.increment,
      rule.successSetCount ?? 0,
    );
  } else if (record.workout_type === "recovery_pushup" || record.workout_type === "sunday_pullup") {
    nextTarget = nextFiveSetTarget(
      [{ target_total: record.target_total, set_reps: record.set_reps }],
      record.target_total,
      rule.increment,
    );
  }
  return { state: nextTarget > record.target_total ? "pr" : "performed", programVersion };
}

export function recordState(
  records: AchievementRecord[],
  programVersions: readonly WorkoutProgramVersion[],
): "none" | "performed" | "pr" {
  if (records.some((record) => recordOutcome(record, programVersions).state === "pr")) return "pr";
  return records.length > 0 ? "performed" : "none";
}
