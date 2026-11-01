// Time ranges (as UTC ISO strings for Supabase filters) in Israel time.
import {
  addDays,
  businessWeekOf,
  israelTimeToDate,
  type BusinessWeek,
  type WeekSettings,
} from "@/lib/staff/week";

export type IsoRange = { from: string; to: string };

/** [start of first day, start of the day after last day) in Israel time. */
export function dateSpanRange(firstDate: string, lastDate: string): IsoRange {
  return {
    from: israelTimeToDate(firstDate, 0).toISOString(),
    to: israelTimeToDate(addDays(lastDate, 1), 0).toISOString(),
  };
}

export function dayRange(date: string): IsoRange {
  return dateSpanRange(date, date);
}

/**
 * Orders belong to a business week from the previous week's close until this
 * week's close (an order on Saturday night after the close is next week's).
 */
export function weekOrdersRange(week: BusinessWeek, settings: WeekSettings): IsoRange {
  const prev = businessWeekOf(addDays(week.weekStart, -7), settings);
  return { from: prev.closesAt.toISOString(), to: week.closesAt.toISOString() };
}

/** First and last calendar day of the month of an Israel date. */
export function monthSpan(date: string): { first: string; last: string } {
  const [y, m] = date.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

/**
 * Business-week starts (same weekday as `anyWeekStart`) that fall inside
 * [first, last]. A week counts in the month its start day falls in.
 */
export function weekStartsInSpan(anyWeekStart: string, first: string, last: string): string[] {
  let d = anyWeekStart;
  while (d > first) d = addDays(d, -7);
  while (d < first) d = addDays(d, 7);
  const out: string[] = [];
  for (; d <= last; d = addDays(d, 7)) out.push(d);
  return out;
}
