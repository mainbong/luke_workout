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

export function fiveSetSucceeded(record: FiveSetRecord) {
  return record.set_reps?.length === 5
    && record.set_reps.every((reps) => reps >= record.target_total);
}

export function nextFiveSetTarget(records: FiveSetRecord[], startTarget: number) {
  if (records.length === 0) return startTarget;
  return records[0].target_total + (fiveSetSucceeded(records[0]) ? 1 : 0);
}
