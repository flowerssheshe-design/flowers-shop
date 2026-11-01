import { describe, expect, it } from "vitest";
import { buildPayContext } from "@/lib/staff/pay-context";
import {
  BUDGET_REMAINDER_ROLE,
  PAY_ENTRY_ROLE,
  buildDashboard,
  computePayroll,
  payrollWeekOf,
  sumPayroll,
  withPayEntries,
  type EmployeeRow,
  type ShiftRow,
} from "./week-math";
import { payrollSnapshots } from "./week-close";
import { buildPaySummary, payLinesByWeek } from "./pay-summary";

const W1 = "2026-11-01";
const W4 = "2026-11-22";

const employees: EmployeeRow[] = [
  { id: "a", full_name: "אבי", role: "worker", roles: [], pay_type: "per_shift", pay_rate: 200, is_active: true },
  { id: "m", full_name: "מנהלת", role: "ops_manager", roles: ["ops_manager"], pay_type: null, pay_rate: null, responsibility_pay: 500, is_active: true },
  { id: "o", full_name: "בעלים", role: "owner", roles: ["owner"], pay_type: null, pay_rate: null, is_active: true },
];

const ctx = buildPayContext(
  [
    { employee_id: "a", effective_week: "2000-01-02", pay_type: "per_shift", pay_rate: 150, responsibility_pay: null },
    { employee_id: "a", effective_week: W4, pay_type: "per_shift", pay_rate: 200, responsibility_pay: null },
    { employee_id: "m", effective_week: "2000-01-02", pay_type: null, pay_rate: null, responsibility_pay: 300 },
  ],
  [
    { id: "e1", week_start: W1, employee_id: "a", description: "בונוס", amount: 50 },
    { id: "e2", week_start: W1, employee_id: null, description: "עובד דוכן", amount: 150 },
    { id: "e3", week_start: W1, employee_id: "o", description: "לא משולם", amount: 70 },
    { id: "e4", week_start: W4, employee_id: null, description: "אחר", amount: 10 },
  ],
);

const shift = (work_date: string, employee_id = "a"): ShiftRow => ({
  employee_id,
  work_date,
  start_time: "08:00",
  end_time: "10:00",
  shift_type: "supply",
});

describe("computePayroll with pay history and one-off payments", () => {
  it("pays each week with its own rate and adds the week's payments", () => {
    const lines = computePayroll(employees, [shift("2026-11-02")], new Map(), undefined, undefined, ctx, W1);
    const a = lines.find((l) => l.employee_id === "a")!;
    expect(a.amount).toBe(150 + 50);
    expect(a.fromEntries).toBe(50);
    expect(lines.find((l) => l.employee_id === "m")!.amount).toBe(300);
    expect(lines.some((l) => l.employee_id === "o")).toBe(false);
    const entry = lines.find((l) => l.role === PAY_ENTRY_ROLE)!;
    expect(entry).toMatchObject({ employee_id: "", full_name: "עובד דוכן", amount: 150 });
    expect(sumPayroll(lines)).toBe(200 + 300 + 150);

    const later = computePayroll(employees, [shift("2026-11-23")], new Map(), undefined, undefined, ctx, W4);
    expect(later.find((l) => l.employee_id === "a")!.amount).toBe(200);
    expect(later.filter((l) => l.role === PAY_ENTRY_ROLE).map((l) => l.full_name)).toEqual(["אחר"]);
  });

  it("without ctx nothing changes (employee columns, no payments)", () => {
    const lines = computePayroll(employees, [shift("2026-11-02")], new Map());
    expect(lines.find((l) => l.employee_id === "a")!.amount).toBe(200);
    expect(lines.find((l) => l.employee_id === "m")!.amount).toBe(500);
    expect(lines.some((l) => l.role === PAY_ENTRY_ROLE)).toBe(false);
    expect(lines.find((l) => l.employee_id === "a")).not.toHaveProperty("fromEntries");
  });

  it("finds the week from the budget, the shifts or untilDate when not given", () => {
    expect(payrollWeekOf([], undefined, { weekStart: W4, amount: null, allocations: new Map() })).toBe(W4);
    expect(payrollWeekOf([{ work_date: "2026-11-05" }, { work_date: "2026-11-03" }])).toBe(W1);
    expect(payrollWeekOf([], "2026-11-04")).toBe(W1);
    expect(payrollWeekOf([], undefined, undefined, W4)).toBe(W4);
    expect(payrollWeekOf([])).toBeUndefined();
    // 6 arguments (the money page): the week comes from the budget loadBudgets returns.
    const lines = computePayroll(employees, [], new Map(), undefined, { weekStart: W1, amount: null, allocations: new Map() }, ctx);
    expect(lines.find((l) => l.employee_id === "a")!.amount).toBe(50);
  });
});

describe("snapshots never hold one-off payments", () => {
  it("skips unassigned payments and the budget remainder, and stores the amount without payments", () => {
    const budget = { weekStart: W1, amount: 400, allocations: new Map([["a", 100]]) };
    const lines = computePayroll(employees, [shift("2026-11-02")], new Map(), undefined, budget, ctx, W1);
    expect(lines.some((l) => l.role === BUDGET_REMAINDER_ROLE)).toBe(true);
    const snaps = payrollSnapshots(W1, lines);
    expect(snaps.every((s) => s.employee_id)).toBe(true);
    expect(new Map(snaps.map((s) => [s.employee_id, s.amount]))).toEqual(
      new Map([
        ["m", 300],
        ["a", 250], // 150 rate + 100 budget, without the 50 bonus
      ]),
    );
  });

  it("an employee whose only pay is a payment gets no snapshot row", () => {
    const c = buildPayContext([], [{ id: "x", week_start: W1, employee_id: "b", description: "בונוס", amount: 80 }]);
    const emp: EmployeeRow[] = [{ id: "b", full_name: "בת", role: "worker", pay_type: null, pay_rate: null, is_active: true }];
    const lines = computePayroll(emp, [], new Map(), undefined, undefined, c, W1);
    expect(lines.map((l) => l.amount)).toEqual([80]);
    expect(payrollSnapshots(W1, lines)).toEqual([]);
  });

  it("withPayEntries adds payments back on top of snapshot lines", () => {
    const merged = withPayEntries(
      [{ employee_id: "a", full_name: "אבי", role: "worker", shifts: 1, hours: 2, deliveries: 0, amount: 150, fromResponsibility: 0 }],
      ctx,
      W1,
      employees,
    );
    expect(merged.find((l) => l.employee_id === "a")!.amount).toBe(200);
    expect(merged.find((l) => l.role === PAY_ENTRY_ROLE)!.amount).toBe(150);
    expect(merged.some((l) => l.employee_id === "o")).toBe(false);
  });
});

describe("dashboard with a pay context", () => {
  it("one-off payments count fully in 'so far'", () => {
    const settings = {
      supplier_order_day: 3,
      supplier_order_time: "12:00",
      week_close_day: 6,
      week_close_time: "21:00",
    } as unknown as Parameters<typeof buildDashboard>[0]["settings"];
    const week = {
      weekStart: W1,
      weekEnd: "2026-11-07",
      supplierOrderAt: new Date("2026-11-04T10:00:00Z"),
      closesAt: new Date("2026-11-07T19:00:00Z"),
      phase: "preorder",
    } as Parameters<typeof buildDashboard>[0]["week"];
    const d = buildDashboard({
      week,
      settings,
      now: new Date("2026-11-02T10:00:00Z"),
      orders: [],
      products: [],
      expenses: [],
      employees,
      shifts: [shift("2026-11-05")],
      stalls: [],
      stallStock: [],
      supplierLines: [],
      supplierOrderedAt: null,
      payContext: ctx,
    });
    const entry = d.team.find((l) => l.role === PAY_ENTRY_ROLE)!;
    expect(entry.amountSoFar).toBe(150);
    expect(d.team.find((l) => l.employee_id === "a")!.amountSoFar).toBe(50);
    expect(d.payroll.scheduled).toBe(200 + 300 + 150);
  });
});

describe("pay summary", () => {
  it("adds closed weeks, the live week and payments; groups unassigned payments by description", () => {
    const current = W4;
    const currentLines = computePayroll(employees, [shift("2026-11-23")], new Map(), undefined, undefined, ctx, current);
    const linesByWeek = payLinesByWeek({
      currentWeekStart: current,
      currentLines,
      snapshots: [
        { week_start: W1, employee_id: "a", hours: 2, shifts_count: 1, deliveries_count: 0, amount: 150 },
        { week_start: W1, employee_id: "m", hours: 0, shifts_count: 0, deliveries_count: 0, amount: 300 },
      ],
      ctx: buildPayContext(
        [],
        [
          ...ctx.entries,
          { id: "e5", week_start: "2026-10-25", employee_id: null, description: "עובד דוכן", amount: 150 },
          { id: "e6", week_start: "2026-12-27", employee_id: "a", description: "עתידי", amount: 999 },
        ],
      ),
      budgets: new Map([["2026-11-08", { weekStart: "2026-11-08", amount: 100, allocations: new Map() }]]),
      employees,
    });
    const s = buildPaySummary({ currentWeekStart: current, linesByWeek });
    const byKey = new Map(s.people.map((p) => [p.key, p]));
    // a: W1 snapshot 150 + bonus 50; W4 live 200.
    expect(byKey.get("a")!.total).toBe(400);
    expect(byKey.get("a")!.fromEntries).toBe(50);
    expect(byKey.get("a")!.byWeek).toEqual({ [W1]: 200, [W4]: 200 });
    // m: W1 snapshot 300 + W4 live 300.
    expect(byKey.get("m")!.total).toBe(600);
    // Unassigned payments grouped by description over weeks.
    expect(byKey.get("entry:עובד דוכן")!.total).toBe(300);
    expect(byKey.get("entry:אחר")!.total).toBe(10);
    expect(byKey.get("budget")!.total).toBe(100);
    expect(byKey.has("o")).toBe(false);
    expect(s.grandTotal).toBe(400 + 600 + 300 + 10 + 100);
    expect(s.weeks.map((w) => w.weekStart)).toEqual([
      W4, "2026-11-15", "2026-11-08", W1, "2026-10-25", "2026-10-18", "2026-10-11", "2026-10-04",
    ]);
    expect(s.weeks[0]).toMatchObject({ isCurrent: true, total: 200 + 300 + 10 });
    expect(s.weeks[3].total).toBe(200 + 300 + 150);
  });
});
