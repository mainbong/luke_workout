const ROUTINE_IDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

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

export function recordState(
  records: Array<{ record_kind: "workout_session" | "routine_completion" }>,
): "none" | "result" | "completion" | "both" {
  const result = records.some(({ record_kind }) => record_kind === "workout_session");
  const completion = records.some(({ record_kind }) => record_kind === "routine_completion");
  return result ? (completion ? "both" : "result") : completion ? "completion" : "none";
}
