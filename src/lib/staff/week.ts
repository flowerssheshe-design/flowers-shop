// The business week, in Israel time regardless of where the server runs.
//
// A week starts on Sunday. Until the supplier order (default Tuesday 12:00)
// customers place pre-orders; after it, the store sells live from stock.
// The week closes at week_close_day/time (default Saturday 21:00); after that
// the next week is current.

export const BUSINESS_TZ = "Asia/Jerusalem";

export type WeekSettings = {
  supplier_order_day: number;
  supplier_order_time: string;
  week_close_day: number;
  week_close_time: string;
};

export type WeekPhase = "preorder" | "live";

export type BusinessWeek = {
  /** Sunday, "YYYY-MM-DD" (Israel date). */
  weekStart: string;
  /** Saturday, "YYYY-MM-DD". */
  weekEnd: string;
  supplierOrderAt: Date;
  closesAt: Date;
  phase: WeekPhase;
};

type LocalParts = { y: number; m: number; d: number; dow: number; minutes: number };

function localParts(at: Date): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    dow,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function toMinutes(time: string | undefined, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? "").trim());
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "YYYY-MM-DD" for a calendar date, shifted by whole days. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** The UTC instant of a wall-clock time on an Israel calendar date. */
export function israelTimeToDate(isoDate: string, minutes: number): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
  // Correct for the Israel offset at that moment (+2 or +3, DST aware).
  const p = localParts(guess);
  const shownAsUtc = Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes / 60), p.minutes % 60);
  return new Date(guess.getTime() - (shownAsUtc - guess.getTime()));
}

/** Israel calendar date of an instant, "YYYY-MM-DD". */
export function israelDate(at: Date = new Date()): string {
  const p = localParts(at);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function weekFromStart(weekStart: string, s: WeekSettings, now: Date): BusinessWeek {
  const supplierOrderAt = israelTimeToDate(
    addDays(weekStart, s.supplier_order_day),
    toMinutes(s.supplier_order_time, 12 * 60),
  );
  const closesAt = israelTimeToDate(
    addDays(weekStart, s.week_close_day),
    toMinutes(s.week_close_time, 21 * 60),
  );
  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    supplierOrderAt,
    closesAt,
    phase: now < supplierOrderAt ? "preorder" : "live",
  };
}

/** The business week that is current at `now`. */
export function currentBusinessWeek(s: WeekSettings, now: Date = new Date()): BusinessWeek {
  const p = localParts(now);
  const today = israelDate(now);
  const sunday = addDays(today, -p.dow);
  const week = weekFromStart(sunday, s, now);
  // After the close time the next week has already started.
  return now >= week.closesAt ? weekFromStart(addDays(sunday, 7), s, now) : week;
}

/** The business week that contains a given Israel date. */
export function businessWeekOf(isoDate: string, s: WeekSettings, now: Date = new Date()): BusinessWeek {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekFromStart(addDays(isoDate, -dow), s, now);
}
