// Automatic WhatsApp messages: when they are due and to whom. Pure logic.

import { z } from "zod";
import { currentBusinessWeek, type BusinessWeek, type WeekSettings } from "@/lib/staff/week";
import type { CustomerStat } from "./segments";

export type AutomationKind = "preorder_closing" | "order_thanks" | "win_back";
export const AUTOMATION_KINDS: AutomationKind[] = ["preorder_closing", "order_thanks", "win_back"];

export const ConfigSchemas = {
  preorder_closing: z.object({ hours_before: z.number().int().min(1).max(72).default(6) }),
  order_thanks: z.object({}).passthrough().transform(() => ({})),
  win_back: z.object({ weeks: z.number().int().min(1).max(52).default(6) }),
} as const;

export type PreorderClosingConfig = { hours_before: number };
export type WinBackConfig = { weeks: number };

export const DEFAULT_CONFIG: Record<AutomationKind, Record<string, number>> = {
  preorder_closing: { hours_before: 6 },
  order_thanks: {},
  win_back: { weeks: 6 },
};

/** Reads a stored config, falling back to defaults for anything invalid. */
export function parseConfig<K extends AutomationKind>(kind: K, raw: unknown): Record<string, number> {
  const parsed = ConfigSchemas[kind].safeParse(raw ?? {});
  return parsed.success ? (parsed.data as Record<string, number>) : { ...DEFAULT_CONFIG[kind] };
}

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

export type PreorderClosingWindow = { week: BusinessWeek; sendFrom: Date; sendUntil: Date };

/** The reminder goes out from `hours_before` hours before the supplier order until the order itself. */
export function preorderClosingWindow(
  settings: WeekSettings,
  hoursBefore: number,
  now: Date = new Date(),
): PreorderClosingWindow {
  const week = currentBusinessWeek(settings, now);
  const sendUntil = week.supplierOrderAt;
  const sendFrom = new Date(sendUntil.getTime() - Math.max(1, hoursBefore) * HOUR_MS);
  return { week, sendFrom, sendUntil };
}

export function isPreorderClosingDue(
  settings: WeekSettings,
  hoursBefore: number,
  now: Date = new Date(),
): { due: boolean; window: PreorderClosingWindow } {
  const window = preorderClosingWindow(settings, hoursBefore, now);
  const due = window.week.phase === "preorder" && now >= window.sendFrom && now < window.sendUntil;
  return { due, window };
}

/** Idempotency keys stored in message_log.ref (one send per key). */
export const refs = {
  preorderClosing: (weekStart: string, customerId: string) => `preorder_closing:${weekStart}:${customerId}`,
  orderThanks: (orderId: string) => `order_thanks:${orderId}`,
  // One win-back per lapse: a new order changes lastOrderAt, so a later lapse can be messaged again.
  winBack: (customerId: string, lastOrderAt: string) => `win_back:${customerId}:${lastOrderAt.slice(0, 10)}`,
};

/** Customers whose last order is older than `weeks` weeks (and who ordered at least once). */
export function selectWinBack(customers: CustomerStat[], weeks: number, now: Date = new Date()): CustomerStat[] {
  const cutoff = new Date(now.getTime() - Math.max(1, weeks) * WEEK_MS).toISOString();
  return customers.filter((c) => c.optedIn && !!c.phone && !!c.lastOrderAt && c.lastOrderAt < cutoff);
}

/**
 * Pre-order reminder recipients: opted-in customers with a phone who haven't
 * ordered yet this business week.
 */
export function selectPreorderClosing(customers: CustomerStat[], weekStartAt: Date): CustomerStat[] {
  const since = weekStartAt.toISOString();
  return customers.filter((c) => c.optedIn && !!c.phone && !(c.lastOrderAt && c.lastOrderAt >= since));
}
