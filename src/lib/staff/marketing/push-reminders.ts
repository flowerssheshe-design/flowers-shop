// Automatic weekly push notifications (Tuesday / Thursday). Pure rules, no server imports.
//
// Tuesday: "secure your bouquet" before the supplier order closes — a
// pre-order is the only way to be sure of a bouquet, and it tells us how
// much to order. Thursday: stock is limited, order now for Friday ({left} =
// how many bouquets can still be ordered).

import { z } from "zod";

export type ReminderKind = "tuesday" | "thursday";
export const REMINDER_KINDS: ReminderKind[] = ["tuesday", "thursday"];

/** Israel weekday each reminder goes out on (0 = Sunday). */
export const REMINDER_DAY: Record<ReminderKind, number> = { tuesday: 2, thursday: 4 };

export const ReminderSchema = z.object({
  enabled: z.boolean(),
  /** Israel time, whole hour 0–23. */
  hour: z.number().int().min(0).max(23),
  title: z.string().trim().min(2, "כותרת קצרה מדי").max(60, "כותרת ארוכה מדי (עד 60 תווים)"),
  body: z.string().trim().min(2, "טקסט קצר מדי").max(180, "טקסט ארוך מדי (עד 180 תווים)"),
});

export type Reminder = z.infer<typeof ReminderSchema>;
export type ReminderConfig = Record<ReminderKind, Reminder>;

export const DEFAULT_REMINDERS: ReminderConfig = {
  tuesday: {
    enabled: true,
    hour: 9,
    title: "להבטיח זר לשישי 🌸",
    body: "היום נסגרת ההזמנה מהספק. מזמינים עכשיו מראש ומקבלים בדיוק את הזר שרציתם ביום שישי.",
  },
  thursday: {
    enabled: true,
    hour: 18,
    title: "המלאי מוגבל, הזמינו מהר 💐",
    body: "נשארו רק {left} זרים לשישי. הזמינו עכשיו כדי להספיק, לאיסוף מהדוכן או למשלוח.",
  },
};

/** A stored config, with defaults for anything missing or invalid. */
export function parseReminders(raw: unknown): ReminderConfig {
  let value: unknown = raw;
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) value = (value as Record<string, unknown>).value;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_REMINDERS };
  for (const k of REMINDER_KINDS) {
    const parsed = ReminderSchema.safeParse({ ...DEFAULT_REMINDERS[k], ...((obj[k] as object) ?? {}) });
    if (parsed.success) out[k] = parsed.data;
  }
  return out;
}

/**
 * Is this reminder due now? Due on its weekday from its hour until the end of
 * that day (so an hourly job that misses one run still sends it), once per day.
 */
export function isReminderDue(
  kind: ReminderKind,
  r: Reminder,
  now: { weekday: number; hour: number; date: string },
  lastSentDate: string | null | undefined,
): boolean {
  if (!r.enabled) return false;
  if (now.weekday !== REMINDER_DAY[kind]) return false;
  if (now.hour < r.hour) return false;
  return lastSentDate !== now.date;
}

/** Fills {left}. Returns null when the text needs {left} and nothing is left (don't send "0 left"). */
export function renderReminder(r: Reminder, vars: { left: number | null }): { title: string; body: string } | null {
  const needsLeft = /\{left\}/.test(r.title + r.body);
  if (needsLeft && (vars.left === null || vars.left <= 0)) return null;
  const fill = (s: string) => s.replace(/\{left\}/g, String(vars.left ?? ""));
  return { title: fill(r.title), body: fill(r.body) };
}
