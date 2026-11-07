import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { israelDate, israelWeekday } from "@/lib/staff/week";
import { getServerSettings } from "@/lib/settings-server";
import { loadStallSplit } from "@/lib/staff/ops/stall-split-server";
import { pushConfigured, sendPushToAll } from "./push";
import { REMINDER_KINDS, isReminderDue, parseReminders, renderReminder, type ReminderConfig, type ReminderKind } from "./push-reminders";

type Admin = ReturnType<typeof createAdminClient>;

export const REMINDERS_KEY = "push_reminders";
const SENT_KEY = "push_reminders_sent";

function israelHour(at: Date): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hourCycle: "h23" }).format(at);
  return Number(h) || 0;
}

export async function loadReminders(admin: Admin): Promise<{ config: ReminderConfig; sent: Record<string, string> }> {
  const { data } = await admin.from("system_settings").select("key, value").in("key", [REMINDERS_KEY, SENT_KEY]);
  const rows = new Map((data ?? []).map((r) => [String(r.key), r.value as unknown]));
  const sentRaw = rows.get(SENT_KEY);
  const sent = sentRaw && typeof sentRaw === "object" ? (sentRaw as Record<string, string>) : {};
  return { config: parseReminders(rows.get(REMINDERS_KEY)), sent };
}

/** How many bouquets can still be ordered on the website (for {left}). */
async function bouquetsLeft(admin: Admin): Promise<number | null> {
  try {
    const split = await loadStallSplit(admin, { autoLock: false });
    return Array.from(split.split.values()).reduce((s, p) => s + p.orderable, 0);
  } catch {
    const { data, error } = await admin.from("inventory").select("live_stock_count");
    if (error) return null;
    return (data ?? []).reduce((s, r) => s + (Number(r.live_stock_count) || 0), 0);
  }
}

export type ReminderRun = { kind: ReminderKind; status: "sent" | "skipped"; detail?: string; sent?: number };

/**
 * Sends the Tuesday / Thursday notifications that are due (called every hour
 * by the Netlify schedule). Each goes out once per day.
 */
export async function runPushReminders(admin: Admin, now: Date = new Date()): Promise<{ configured: boolean; runs: ReminderRun[] }> {
  if (!pushConfigured()) return { configured: false, runs: [] };
  const { config, sent } = await loadReminders(admin);
  const settings = await getServerSettings();
  const clock = { weekday: israelWeekday(now), hour: israelHour(now), date: israelDate(now) };
  const runs: ReminderRun[] = [];
  let changed = false;

  for (const kind of REMINDER_KINDS) {
    if (!isReminderDue(kind, config[kind], clock, sent[kind])) continue;
    // Mark first, so two runs at the same time can't both send.
    sent[kind] = clock.date;
    changed = true;
    const msg = renderReminder(config[kind], { left: await bouquetsLeft(admin), deadline: settings.supplier_order_time });
    if (!msg) {
      runs.push({ kind, status: "skipped", detail: "no bouquets left" });
      continue;
    }
    const res = await sendPushToAll(admin, { ...msg, url: "/" });
    runs.push({ kind, status: "sent", sent: res.sent });
  }
  if (changed) {
    await admin
      .from("system_settings")
      .upsert({ key: SENT_KEY, value: sent, updated_at: now.toISOString() }, { onConflict: "key" });
  }
  return { configured: true, runs };
}
