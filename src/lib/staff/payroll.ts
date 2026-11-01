// Pay is worked out from the schedule (no clock-in). Shared by "my area"
// (what a worker earned) and the owner's money page (what the week costs).
//
// Stall and courier work is paid from the weekly budget: the owners set an
// amount per week and the ops manager splits it between the workers
// (weekly_pay_allocations). Other work (supplier pickup) is paid by the
// employee's own rate.
//
// A person with a responsibility (shift manager / marketing lead) can also get
// a fixed amount per business week for it (employees.responsibility_pay).
// Owners are never paid.
//
// Pay settings change over time (employee_pay_history, see pay-context.ts):
// a week is paid with the setting that applied in that week, so a change
// never rewrites earlier weeks. One-off payments (payroll_entries) add to the
// employee's pay in their week.

import { entriesTotal, hasPayHistory, rateForWeek, sundayOf, type PayContext } from "@/lib/staff/pay-context";

export type PayType = "hourly" | "per_shift" | "per_delivery";

export type PayEmployee = {
  id: string;
  /** Primary responsibility. */
  role: string;
  /** Every responsibility (owner / ops_manager / marketing). Falls back to role. */
  roles?: string[] | null;
  pay_type: PayType | null;
  pay_rate: number | null;
  /** Fixed pay per business week for the ops_manager / marketing responsibility. */
  responsibility_pay?: number | string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

export type PayShift = {
  employee_id: string;
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
  shift_type?: string;
};

export type Earnings = {
  employee_id: string;
  hours: number;
  shifts: number;
  deliveries: number;
  /** Rate pay + budget allocation + responsibility pay. */
  amount: number;
  /** The part that comes from the weekly budget. */
  fromBudget: number;
  /** The part paid for the responsibility (fixed per week × weeks). */
  fromResponsibility: number;
  /** One-off payments (payroll_entries) included in `amount`. */
  fromEntries: number;
};

/** Responsibilities that may carry a weekly responsibility pay. */
export const PAID_RESPONSIBILITIES: readonly string[] = ["ops_manager", "marketing"];

function rolesOf(employee: Pick<PayEmployee, "role" | "roles">): string[] {
  const roles = Array.isArray(employee.roles) ? employee.roles : [];
  return roles.includes(employee.role) ? roles : [employee.role, ...roles];
}

/** Owners are never paid through the system, whatever else they hold. */
export function isOwnerEmployee(employee: Pick<PayEmployee, "role" | "roles">): boolean {
  return rolesOf(employee).includes("owner");
}

/**
 * The weekly responsibility pay that really applies: 0 for owners, for people
 * without the ops_manager / marketing responsibility, and for inactive or
 * deleted employees.
 */
export function weeklyResponsibilityPay(employee: PayEmployee): number {
  if (isOwnerEmployee(employee)) return 0;
  if (employee.is_active === false || employee.deleted_at) return 0;
  if (!rolesOf(employee).some((r) => PAID_RESPONSIBILITIES.includes(r))) return 0;
  const amount = Number(employee.responsibility_pay);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

/** Shift types paid from the weekly budget instead of the employee's rate. */
export const BUDGET_SHIFT_TYPES: readonly string[] = ["stall", "courier"];

/** Work types the ops manager hires and pays from the budget. */
export const BUDGET_WORK_TYPES: readonly string[] = ["stall_seller", "courier"];

export function isBudgetShift(shiftType: string | undefined | null): boolean {
  return !!shiftType && BUDGET_SHIFT_TYPES.includes(shiftType);
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function shiftHours(shift: Pick<PayShift, "start_time" | "end_time">): number {
  return Math.max(0, minutesOf(shift.end_time) - minutesOf(shift.start_time)) / 60;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Earnings for one employee in a period: their rate for shifts outside the
 * budget, plus what the ops manager allocated them from the budget, plus
 * the responsibility pay once per business week in the period
 * (`responsibilityWeeks`, 1 for a single week).
 * Owners are never paid through the system, even when scheduled.
 */
export function computeEarnings(
  employee: PayEmployee,
  shifts: PayShift[],
  deliveriesCount: number,
  allocation = 0,
  responsibilityWeeks = 1,
): Earnings {
  const mine = shifts.filter((s) => s.employee_id === employee.id);
  const hours = mine.reduce((sum, s) => sum + shiftHours(s), 0);
  const rateShifts = mine.filter((s) => !isBudgetShift(s.shift_type));
  const rate = Number(employee.pay_rate) || 0;
  let ratePay = 0;
  let fromBudget = 0;
  let fromResponsibility = 0;
  if (!isOwnerEmployee(employee)) {
    if (employee.pay_type === "hourly") ratePay = rateShifts.reduce((sum, s) => sum + shiftHours(s), 0) * rate;
    else if (employee.pay_type === "per_shift") ratePay = rateShifts.length * rate;
    // Deliveries are courier work, paid from the budget.
    fromBudget = Math.max(0, Number(allocation) || 0);
    fromResponsibility = weeklyResponsibilityPay(employee) * Math.max(0, Math.floor(Number(responsibilityWeeks) || 0));
  }
  return {
    employee_id: employee.id,
    hours: round2(hours),
    shifts: mine.length,
    deliveries: deliveriesCount,
    amount: round2(ratePay + fromBudget + fromResponsibility),
    fromBudget: round2(fromBudget),
    fromResponsibility: round2(fromResponsibility),
    fromEntries: 0,
  };
}

/**
 * The employee with the pay settings that applied in `weekStart`.
 * - no context, or no history for the employee: the employee's own columns (as before);
 * - history exists: the latest row with effective_week <= weekStart; a week
 *   before the first row has no pay setting (never the newer columns, so a
 *   first change never rewrites earlier weeks).
 */
export function employeeForWeek<E extends PayEmployee>(employee: E, ctx: PayContext | undefined, weekStart: string): E {
  if (!ctx || !hasPayHistory(ctx, employee.id)) return employee;
  const rate = rateForWeek(ctx, employee.id, weekStart);
  return {
    ...employee,
    pay_type: rate?.pay_type ?? null,
    pay_rate: rate?.pay_rate ?? null,
    responsibility_pay: rate?.responsibility_pay ?? null,
  };
}

/**
 * Earnings over a span of business weeks (e.g. a month), each week paid with
 * the setting that applied in it.
 * - `weeks`: the week starts (Sundays) that belong to the span. The budget
 *   allocation, the responsibility pay and one-off payments count for these
 *   weeks only (a week counts in the month its Sunday falls in).
 * - shifts are paid by the rate of the week they fall in.
 * Owners are never paid.
 */
export function computeEarningsByWeek(
  employee: PayEmployee,
  shifts: (PayShift & { work_date: string })[],
  deliveriesCount: number,
  opts: { weeks: string[]; allocations?: Map<string, number>; ctx?: PayContext },
): Earnings {
  const mine = shifts.filter((s) => s.employee_id === employee.id);
  const spanWeeks = new Set(opts.weeks);
  const allWeeks = new Set<string>(opts.weeks);
  for (const s of mine) allWeeks.add(sundayOf(s.work_date));

  let hours = 0;
  let amount = 0;
  let fromBudget = 0;
  let fromResponsibility = 0;
  allWeeks.forEach((week) => {
    const inSpan = spanWeeks.has(week);
    const e = computeEarnings(
      employeeForWeek(employee, opts.ctx, week),
      mine.filter((s) => sundayOf(s.work_date) === week),
      0,
      inSpan ? opts.allocations?.get(week) ?? 0 : 0,
      inSpan ? 1 : 0,
    );
    hours += e.hours;
    amount += e.amount;
    fromBudget += e.fromBudget;
    fromResponsibility += e.fromResponsibility;
  });
  const fromEntries = isOwnerEmployee(employee) ? 0 : entriesTotal(opts.ctx, employee.id, spanWeeks);
  return {
    employee_id: employee.id,
    hours: round2(hours),
    shifts: mine.length,
    deliveries: deliveriesCount,
    amount: round2(amount + fromEntries),
    fromBudget: round2(fromBudget),
    fromResponsibility: round2(fromResponsibility),
    fromEntries,
  };
}

export type WeekBudget = {
  /** The week (Sunday) this budget belongs to; set by loadBudgets. */
  weekStart?: string;
  /** null when the owners haven't set a budget for the week. */
  amount: number | null;
  /** employee_id → amount allocated by the ops manager. */
  allocations: Map<string, number>;
};

export function allocatedTotal(budget: WeekBudget | undefined): number {
  if (!budget) return 0;
  let sum = 0;
  budget.allocations.forEach((v) => (sum += Number(v) || 0));
  return round2(sum);
}

/** Budget the ops manager hasn't split yet (never negative). */
export function unallocated(budget: WeekBudget | undefined): number {
  if (!budget || budget.amount === null) return 0;
  return round2(Math.max(0, budget.amount - allocatedTotal(budget)));
}
