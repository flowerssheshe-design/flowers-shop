// Resolving the "week" query param of the operations screens. Pure.

import {
  addDays,
  businessWeekOf,
  currentBusinessWeek,
  israelTimeToDate,
  type WeekSettings,
} from "@/lib/staff/week";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ResolvedWeek = {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  /** Orders created in [from, to) belong to this business week. */
  from: Date;
  to: Date;
};

function isValidDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Any date inside the wanted week (usually its Sunday) → that business week.
 * Missing / invalid → the current business week.
 * The order window runs from the previous week's close to this week's close,
 * so a Saturday-night order counts in the week it is delivered.
 */
export function resolveWeek(param: string | null | undefined, s: WeekSettings, now: Date = new Date()): ResolvedWeek {
  const current = currentBusinessWeek(s, now);
  const week = param && isValidDate(param) ? businessWeekOf(param, s, now) : current;
  const prev = businessWeekOf(addDays(week.weekStart, -7), s, now);
  return {
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    isCurrentWeek: week.weekStart === current.weekStart,
    from: prev.closesAt,
    to: week.closesAt,
  };
}

/** Midnight-to-midnight bounds of an Israel calendar date. */
export function israelDayBounds(isoDate: string): { from: Date; to: Date } {
  return { from: israelTimeToDate(isoDate, 0), to: israelTimeToDate(addDays(isoDate, 1), 0) };
}
