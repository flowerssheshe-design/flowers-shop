import { describe, expect, it } from "vitest";
import {
  buildPayContext,
  emptyPayContext,
  entriesTotal,
  isSunday,
  migratedSalaryEntries,
  rateForWeek,
  sundayOf,
  type PayContext,
} from "./pay-context";
import { computeEarningsByWeek, employeeForWeek, type PayEmployee } from "./payroll";

// The owners' example: paid 150 a shift for 3 weeks, then changed to 200.
const W1 = "2026-11-01";
const W2 = "2026-11-08";
const W3 = "2026-11-15";
const W4 = "2026-11-22";

function ctxWith(rows: { week: string; rate: number; resp?: number | null }[], employeeId = "a"): PayContext {
  return buildPayContext(
    rows.map((r) => ({
      employee_id: employeeId,
      effective_week: r.week,
      pay_type: "per_shift",
      pay_rate: String(r.rate),
      responsibility_pay: r.resp ?? null,
    })),
    [],
  );
}

describe("rateForWeek", () => {
  const ctx = ctxWith([
    { week: "2000-01-02", rate: 150 },
    { week: W4, rate: 200 },
  ]);

  it("a change in week 4 does not touch the 3 weeks before it", () => {
    expect(rateForWeek(ctx, "a", W1)?.pay_rate).toBe(150);
    expect(rateForWeek(ctx, "a", W2)?.pay_rate).toBe(150);
    expect(rateForWeek(ctx, "a", W3)?.pay_rate).toBe(150);
    expect(rateForWeek(ctx, "a", W4)?.pay_rate).toBe(200);
    expect(rateForWeek(ctx, "a", "2026-12-27")?.pay_rate).toBe(200);
  });

  it("returns null without history or before the first row", () => {
    expect(rateForWeek(undefined, "a", W1)).toBeNull();
    expect(rateForWeek(emptyPayContext(), "a", W1)).toBeNull();
    expect(rateForWeek(ctxWith([{ week: W2, rate: 100 }]), "a", W1)).toBeNull();
  });

  it("buildPayContext sorts rows and parses numeric strings", () => {
    const c = buildPayContext(
      [
        { employee_id: "a", effective_week: W4, pay_type: "hourly", pay_rate: "45.50", responsibility_pay: null },
        { employee_id: "a", effective_week: W1, pay_type: "per_delivery", pay_rate: "10", responsibility_pay: "300" },
      ],
      [{ id: "x", week_start: W1, employee_id: null, description: "עובד דוכן", amount: "150.00" }],
    );
    expect(c.history.get("a")!.map((r) => r.effective_week)).toEqual([W1, W4]);
    expect(c.history.get("a")![0]).toEqual({ effective_week: W1, pay_type: null, pay_rate: 10, responsibility_pay: 300 });
    expect(c.history.get("a")![1].pay_rate).toBe(45.5);
    expect(c.entries[0].amount).toBe(150);
  });
});

describe("pay by week with history", () => {
  const worker: PayEmployee = { id: "a", role: "worker", roles: [], pay_type: "per_shift", pay_rate: 200, is_active: true };
  const ctx = ctxWith([
    { week: "2000-01-02", rate: 150 },
    { week: W4, rate: 200 },
  ]);
  // One supplier pickup shift every week (Monday).
  const shifts = [W1, W2, W3, W4].map((w) => ({
    employee_id: "a",
    work_date: sundayOf(w) === w ? addOne(w) : w,
    start_time: "08:00",
    end_time: "10:00",
    shift_type: "supply",
  }));

  it("the latest columns (200) never rewrite earlier weeks", () => {
    expect(employeeForWeek(worker, ctx, W1).pay_rate).toBe(150);
    expect(employeeForWeek(worker, ctx, W4).pay_rate).toBe(200);
    const e = computeEarningsByWeek(worker, shifts, 0, { weeks: [W1, W2, W3, W4], ctx });
    expect(e.amount).toBe(150 * 3 + 200);
  });

  it("without a context it uses the employee columns, as before", () => {
    expect(computeEarningsByWeek(worker, shifts, 0, { weeks: [W1, W2, W3, W4] }).amount).toBe(800);
  });

  it("a first change for someone without seeded history leaves earlier weeks unpaid by rate, not at the new rate", () => {
    const c = ctxWith([{ week: W4, rate: 200 }]);
    expect(employeeForWeek(worker, c, W3).pay_rate).toBeNull();
    expect(computeEarningsByWeek(worker, shifts, 0, { weeks: [W1, W2, W3, W4], ctx: c }).amount).toBe(200);
  });

  it("responsibility pay follows the week's setting; one-off payments count in their week", () => {
    const ops: PayEmployee = { id: "m", role: "ops_manager", roles: ["ops_manager"], pay_type: null, pay_rate: null, responsibility_pay: 500, is_active: true };
    const c = buildPayContext(
      [
        { employee_id: "m", effective_week: "2000-01-02", pay_type: null, pay_rate: null, responsibility_pay: 300 },
        { employee_id: "m", effective_week: W3, pay_type: null, pay_rate: null, responsibility_pay: 500 },
      ],
      [
        { id: "1", week_start: W2, employee_id: "m", description: "בונוס", amount: 100 },
        { id: "2", week_start: W4, employee_id: "m", description: "בונוס", amount: 50 },
        { id: "3", week_start: W2, employee_id: "other", description: "x", amount: 999 },
      ],
    );
    const month = computeEarningsByWeek(ops, [], 0, { weeks: [W1, W2, W3], ctx: c });
    expect(month.fromResponsibility).toBe(300 + 300 + 500);
    expect(month.fromEntries).toBe(100);
    expect(month.amount).toBe(1200);
    expect(computeEarningsByWeek(ops, [], 0, { weeks: [W4], ctx: c }).amount).toBe(550);
    expect(entriesTotal(c, "m", [W1, W2, W3, W4])).toBe(150);
  });

  it("owners are never paid, not even one-off payments", () => {
    const owner: PayEmployee = { id: "o", role: "owner", roles: ["owner"], pay_type: "hourly", pay_rate: 50 };
    const c = buildPayContext([], [{ id: "1", week_start: W1, employee_id: "o", description: "x", amount: 100 }]);
    expect(computeEarningsByWeek(owner, [], 0, { weeks: [W1], ctx: c }).amount).toBe(0);
  });
});

describe("dates", () => {
  it("sundayOf / isSunday", () => {
    expect(sundayOf("2026-10-08")).toBe("2026-10-04"); // Thursday
    expect(sundayOf("2026-10-16")).toBe("2026-10-11"); // Friday
    expect(sundayOf("2026-10-30")).toBe("2026-10-25"); // Friday
    expect(sundayOf("2026-11-01")).toBe("2026-11-01"); // Sunday
    expect(sundayOf("2026-11-07")).toBe("2026-11-01"); // Saturday
    expect(isSunday("2026-11-01")).toBe(true);
    expect(isSunday("2026-11-02")).toBe(false);
  });
});

describe("migration 039: old salary expenses → payroll_entries (TS twin of the SQL)", () => {
  it("today's rows produce exactly these entries", () => {
    const rows = migratedSalaryEntries([
      { description: "עובד דוכן", amount: "150", expense_type: "recurring", expense_date: "2026-10-08", is_active: true },
      { description: "תוספת לשובי", amount: 100, expense_type: "one_time", expense_date: "2026-10-16" },
      { description: "עובד נוסף בדוכן", amount: 150, expense_type: "recurring", expense_date: "2026-10-30", is_active: null },
    ]);
    expect(rows).toEqual([
      { week_start: "2026-10-04", description: "עובד דוכן", amount: 150 },
      { week_start: "2026-10-11", description: "עובד דוכן", amount: 150 },
      { week_start: "2026-10-11", description: "תוספת לשובי", amount: 100 },
      { week_start: "2026-10-18", description: "עובד דוכן", amount: 150 },
      { week_start: "2026-10-25", description: "עובד דוכן", amount: 150 },
      { week_start: "2026-10-25", description: "עובד נוסף בדוכן", amount: 150 },
    ]);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(850);
  });

  it("inactive recurring rows and rows starting at the new system move nothing", () => {
    expect(
      migratedSalaryEntries([
        { description: "x", amount: 1, expense_type: "recurring", expense_date: "2026-10-01", is_active: false },
        { description: "y", amount: 1, expense_type: "recurring", expense_date: "2026-11-03" },
      ]),
    ).toEqual([]);
  });
});

function addOne(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
