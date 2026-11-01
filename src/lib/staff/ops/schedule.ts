// Pure scheduling helpers: overlaps, who may be picked for a shift, time
// formatting. No server-only imports (tested in vitest).

import type { StaffRole, WorkType } from "@/lib/staff/access";
import type { ShiftType } from "./types";

export const SHIFT_TYPES: ShiftType[] = ["stall", "courier", "supply"];

/** Which work type a worker needs for each shift type. */
export const WORK_TYPE_FOR_SHIFT: Record<ShiftType, WorkType> = {
  stall: "stall_seller",
  courier: "courier",
  supply: "supply_runner",
};

export function timeToMinutes(time: string): number {
  const [h, m] = String(time).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** "08:00:00" → "08:00". */
export function hhmm(time: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ""));
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export type ShiftSlot = {
  id?: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
};

/** Two shifts overlap when they share an employee and date and their times intersect. Touching edges don't. */
export function shiftsOverlap(a: ShiftSlot, b: ShiftSlot): boolean {
  if (a.employee_id !== b.employee_id || a.work_date !== b.work_date) return false;
  if (a.id && b.id && a.id === b.id) return false;
  return timeToMinutes(a.start_time) < timeToMinutes(b.end_time) &&
    timeToMinutes(b.start_time) < timeToMinutes(a.end_time);
}

/** Shifts in `existing` that overlap `candidate` (the candidate itself is skipped by id). */
export function findOverlaps<T extends ShiftSlot>(candidate: ShiftSlot, existing: T[]): T[] {
  return existing.filter((s) => shiftsOverlap(candidate, s));
}

/** Ids of every shift that overlaps at least one other shift in the list. */
export function overlappingIds(shifts: ShiftSlot[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (shiftsOverlap(shifts[i], shifts[j])) {
        if (shifts[i].id) ids.add(shifts[i].id!);
        if (shifts[j].id) ids.add(shifts[j].id!);
      }
    }
  }
  return ids;
}

export type PoolMember = {
  id: string;
  role: StaffRole;
  work_types: string[];
  is_active: boolean;
};

/**
 * Can this employee be scheduled for this kind of shift?
 * Owners and ops managers can take any shift; everyone else needs the matching
 * work type (a marketing lead who also sells at a stall can take stall shifts).
 */
export function canWorkShift(member: PoolMember, type: ShiftType): boolean {
  if (!member.is_active) return false;
  if (member.role === "owner" || member.role === "ops_manager") return true;
  return member.work_types.includes(WORK_TYPE_FOR_SHIFT[type]);
}

export function eligibleFor<T extends PoolMember>(pool: T[], type: ShiftType): T[] {
  return pool.filter((m) => canWorkShift(m, type));
}

/** Courier of the week: same rule as a courier shift. */
export function canBeWeekCourier(member: PoolMember): boolean {
  return canWorkShift(member, "courier");
}
