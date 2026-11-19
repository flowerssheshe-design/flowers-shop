// Browser-side fetch helper for the operations screens.

import { T } from "@/lib/staff/labels";

export async function opsFetch<R>(url: string, init?: { method?: string; body?: unknown }): Promise<R> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error(T.networkError);
  }
  const data = (await res.json().catch(() => null)) as (R & { error?: string }) | null;
  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/staff/login";
    }
    throw new Error(data?.error || (init?.method && init.method !== "GET" ? T.saveError : T.loadError));
  }
  if (init?.method && init.method !== "GET" && isScheduleChange(url)) {
    window.dispatchEvent(new Event(SCHEDULE_CHANGED_EVENT));
  }
  return data as R;
}

/** Fired after any change to the schedule (a shift, the courier, a copied week), on any screen. */
export const SCHEDULE_CHANGED_EVENT = "staff:schedule-changed";

/** Shifts and the week's courier; not the pay split itself (/schedule/pay). */
export function isScheduleChange(url: string): boolean {
  const path = url.split("?")[0];
  return /^\/api\/staff\/schedule(\/|$)/.test(path) && !path.startsWith("/api/staff/schedule/pay");
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "numeric" }) {
  // Calendar dates ("YYYY-MM-DD") are read at noon UTC so the day never shifts.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", ...opts });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
