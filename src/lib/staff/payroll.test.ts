import { describe, expect, it } from "vitest";
import { computeEarnings, weeklyResponsibilityPay, type PayEmployee, type PayShift } from "./payroll";
import { computePayroll, type EmployeeRow } from "./owner/week-math";
import { payrollSnapshots } from "./owner/week-close";

const shifts: PayShift[] = [{ employee_id: "m", start_time: "09:00", end_time: "13:00", shift_type: "supply" }];

const ops = (extra: Partial<PayEmployee> = {}): PayEmployee => ({
  id: "m",
  role: "ops_manager",
  roles: ["ops_manager"],
  pay_type: "hourly",
  pay_rate: 40,
  responsibility_pay: 500,
  ...extra,
});

describe("responsibility pay in computeEarnings", () => {
  it("adds the weekly amount on top of pay for work", () => {
    const e = computeEarnings(ops(), shifts, 0, 100);
    expect(e.fromResponsibility).toBe(500);
    expect(e.fromBudget).toBe(100);
    expect(e.amount).toBe(160 + 100 + 500);
  });

  it("counts once per business week in the period", () => {
    expect(computeEarnings(ops(), [], 0, 0, 4).fromResponsibility).toBe(2000);
    expect(computeEarnings(ops(), [], 0, 0, 5).amount).toBe(2500);
    expect(computeEarnings(ops(), [], 0, 0, 0).amount).toBe(0);
  });

  it("works for the marketing responsibility too, also as an extra one", () => {
    expect(computeEarnings(ops({ role: "marketing", roles: ["marketing"] }), [], 0).fromResponsibility).toBe(500);
    expect(computeEarnings(ops({ role: "ops_manager", roles: ["ops_manager", "marketing"] }), [], 0).amount).toBe(500);
  });

  it("never pays owners, even with ops/marketing as well", () => {
    const owner = ops({ role: "owner", roles: ["owner", "ops_manager"] });
    const e = computeEarnings(owner, shifts, 0, 100, 4);
    expect(e.amount).toBe(0);
    expect(e.fromResponsibility).toBe(0);
    expect(weeklyResponsibilityPay(ops({ role: "ops_manager", roles: ["ops_manager", "owner"] }))).toBe(0);
  });

  it("ignores the value without the ops_manager / marketing responsibility", () => {
    expect(weeklyResponsibilityPay(ops({ role: "worker", roles: [] }))).toBe(0);
    expect(computeEarnings(ops({ role: "worker", roles: [] }), shifts, 0).amount).toBe(160);
  });

  it("ignores inactive, deleted, empty and negative values", () => {
    expect(weeklyResponsibilityPay(ops({ is_active: false }))).toBe(0);
    expect(weeklyResponsibilityPay(ops({ deleted_at: "2026-10-01T00:00:00Z" }))).toBe(0);
    expect(weeklyResponsibilityPay(ops({ responsibility_pay: null }))).toBe(0);
    expect(weeklyResponsibilityPay(ops({ responsibility_pay: -5 }))).toBe(0);
    expect(weeklyResponsibilityPay(ops({ responsibility_pay: "250.5" }))).toBe(250.5);
  });

  it("falls back to role when roles is missing (before migration 037)", () => {
    expect(weeklyResponsibilityPay(ops({ roles: undefined }))).toBe(500);
  });
});

describe("responsibility pay in computePayroll", () => {
  const employees: EmployeeRow[] = [
    { ...ops(), full_name: "מנהלת", is_active: true },
    {
      id: "o",
      full_name: "בעלים",
      role: "owner",
      roles: ["owner", "marketing"],
      pay_type: null,
      pay_rate: null,
      responsibility_pay: 900,
      is_active: true,
    },
    { id: "w", full_name: "עובד", role: "worker", roles: [], pay_type: null, pay_rate: null, responsibility_pay: 300, is_active: true },
    {
      id: "x",
      full_name: "לשעבר",
      role: "marketing",
      roles: ["marketing"],
      pay_type: null,
      pay_rate: null,
      responsibility_pay: 300,
      is_active: false,
    },
  ];

  it("includes such employees even without shifts, once for the week", () => {
    const lines = computePayroll(employees, [], new Map());
    expect(lines.map((l) => l.employee_id)).toEqual(["m"]);
    expect(lines[0].amount).toBe(500);
    expect(lines[0].fromResponsibility).toBe(500);
  });

  it("counts fully in 'so far' numbers", () => {
    const weekShifts = [{ ...shifts[0], work_date: "2026-11-05" }];
    const soFar = computePayroll(employees, weekShifts, new Map(), "2026-11-02");
    expect(soFar.find((l) => l.employee_id === "m")?.amount).toBe(500);
    const all = computePayroll(employees, weekShifts, new Map());
    expect(all.find((l) => l.employee_id === "m")?.amount).toBe(660);
  });

  it("is part of the week-close snapshot amount; owners are not snapshotted", () => {
    const lines = computePayroll(employees, [{ ...shifts[0], employee_id: "o", work_date: "2026-11-02" }], new Map());
    const snaps = payrollSnapshots("2026-11-01", lines);
    expect(snaps.map((s) => [s.employee_id, s.amount])).toEqual([["m", 500]]);
  });
});
