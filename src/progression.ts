export type FiveSetRecord = {
  target_total: number;
  set_reps: number[] | null;
};

export function countMissionWorkoutDays(
  records: { workout_date: string }[],
  startDate: string,
  endDate: string,
) {
  return new Set(
    records
      .map((record) => record.workout_date)
      .filter((date) => date >= startDate && date <= endDate),
  ).size;
}

type TotalRecord = {
  target_total: number;
  total_reps: number;
};

type PullRecord = TotalRecord & {
  set_count: number | null;
};

export function fiveSetSucceeded(record: FiveSetRecord) {
  return record.set_reps?.length === 5
    && record.set_reps.every((reps) => reps >= record.target_total);
}

export function nextPushTarget(records: TotalRecord[], startTarget: number, increment: number) {
  if (records.length === 0) return startTarget;
  return records[0].target_total + (records[0].total_reps >= records[0].target_total ? increment : 0);
}

export function nextPullTarget(
  records: PullRecord[],
  startTarget: number,
  increment: number,
  successSetThreshold: number,
) {
  if (records.length === 0) return startTarget;
  const latest = records[0];
  return latest.target_total + (
    latest.total_reps >= latest.target_total
    && latest.set_count !== null
    && latest.set_count <= successSetThreshold
      ? increment
      : 0
  );
}

export function nextFiveSetTarget(records: FiveSetRecord[], startTarget: number, increment = 1) {
  if (records.length === 0) return startTarget;
  return records[0].target_total + (fiveSetSucceeded(records[0]) ? increment : 0);
}
