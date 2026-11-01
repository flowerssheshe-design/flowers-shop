// Which stalls a staff member may work at today. Pure, so it can be tested.
//
// Owners and ops managers may pick any active stall. A worker gets the
// stall(s) of their stall shifts today, and nothing else.

export type StallRow = { id: string; name: string; location?: string | null; is_active: boolean; is_open?: boolean; sort_order?: number };
export type TodayShiftRow = { stall_id: string | null; shift_type: string; start_time?: string };

export function isStallManager(who: { role: string }): boolean {
  return who.role === "owner" || who.role === "ops_manager";
}

export function allowedStalls(
  who: { role: string },
  stalls: StallRow[],
  myShiftsToday: TodayShiftRow[],
): StallRow[] {
  const active = stalls.filter((s) => s.is_active);
  if (isStallManager(who)) return active;
  const mine = new Set(
    myShiftsToday.filter((s) => s.shift_type === "stall" && s.stall_id).map((s) => s.stall_id as string),
  );
  return active.filter((s) => mine.has(s.id));
}

/** The stall to show first: the worker's earliest stall shift today, else the first allowed. */
export function defaultStallId(allowed: StallRow[], myShiftsToday: TodayShiftRow[]): string | null {
  const byTime = myShiftsToday
    .filter((s) => s.shift_type === "stall" && s.stall_id)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  for (const s of byTime) {
    if (allowed.some((a) => a.id === s.stall_id)) return s.stall_id;
  }
  return allowed[0]?.id ?? null;
}
