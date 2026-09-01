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
  set_count?: number | null;
};

type PullRecord = TotalRecord & {
  set_count: number | null;
};

export function fiveSetSucceeded(record: FiveSetRecord) {
  return record.set_reps?.length === 5
    && record.set_reps.every((reps) => reps >= record.target_total);
}

export function nextPushTarget(
  records: TotalRecord[],
  startTarget: number,
  increment: number,
  earlyIncrement = increment,
  earlySuccessSetCount = 0,
) {
  if (records.length === 0) return startTarget;
  const latest = records[0];
  if (latest.total_reps < latest.target_total) return latest.target_total;
  return latest.target_total + (
    latest.set_count !== null
    && latest.set_count !== undefined
    && latest.set_count <= earlySuccessSetCount
      ? earlyIncrement
      : increment
  );
}

type PlankRecord = {
  details?: {
    plank_succeeded?: boolean;
    plank_hold_seconds?: number;
    plank_rest_seconds?: number;
  } | null;
};

export function nextPlankTarget(
  records: PlankRecord[],
  initialHoldSeconds: number,
  initialRestSeconds: number,
  holdIncrementSeconds: number,
  restIncrementSeconds: number,
) {
  const latest = records[0]?.details;
  if (!latest
    || !Number.isInteger(latest.plank_hold_seconds)
    || !Number.isInteger(latest.plank_rest_seconds)) {
    return { holdSeconds: initialHoldSeconds, restSeconds: initialRestSeconds };
  }
  return {
    holdSeconds: latest.plank_hold_seconds! + (latest.plank_succeeded ? holdIncrementSeconds : 0),
    restSeconds: latest.plank_rest_seconds! + (latest.plank_succeeded ? restIncrementSeconds : 0),
  };
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
  return Math.max(startTarget, records[0].target_total + (fiveSetSucceeded(records[0]) ? increment : 0));
}
