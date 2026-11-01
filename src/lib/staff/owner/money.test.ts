import { describe, it, expect } from "vitest";
import { currentBusinessWeek } from "@/lib/staff/week";
import {
  buildMoneyOverview,
  buildMoneyReport,
  expenseSummary,
  paymentSplit,
  sumWeeks,
  weeksSince,
  type MoneyInput,
} from "./money";
import type { OrderRow } from "./week-math";

const SETTINGS = { supplier_order_day: 2, supplier_order_time: "12:00", week_close_day: 6, week_close_time: "21:00" };
const NOW = new Date("2026-11-04T08:00:00Z"); // Wednesday, week of Sun 2026-11-01
const ROSE = "rose";

function order(o: Partial<OrderRow> & { id: string }): OrderRow {
  return { created_at: "2026-11-02T10:00:00Z", status: "approved", order_type: "preorder", total_amount: 0, items: [], ...o };
}

describe("paymentSplit", () => {
  it("counts only paid orders, split by Bit / cash / PayBox", () => {
    const s = paymentSplit([
      order({ id: "1", payment_method: "bit", total_amount: 100 }),
      order({ id: "2", payment_method: "cash", total_amount: 50, status: "completed" }),
      order({ id: "3", payment_method: "paybox", total_amount: 70, status: "archived" }),
      order({ id: "4", payment_method: "bit", total_amount: 200, status: "pending_payment" }),
      order({ id: "5", payment_method: "cash", total_amount: 999, status: "cancelled" }),
      order({ id: "6", payment_method: null, total_amount: 30 }),
      order({ id: "7", order_type: "stall", payment_method: "cash", total_amount: 80 }),
    ]);
    expect(s).toEqual({
      bit: 100,
      cash: 130,
      paybox: 70,
      other: 30,
      total: 330,
      count: 5,
      pending: { count: 1, amount: 200 },
    });
  });
});

function moneyInput(): MoneyInput {
  const current = currentBusinessWeek(SETTINGS, NOW);
  return {
    current,
    settings: SETTINGS,
    now: NOW,
    weeks: 3,
    orders: [
      // this week
      order({ id: "a", total_amount: 200, payment_method: "bit", items: [{ productId: ROSE, qty: 2, price: 100 }] }),
      order({ id: "b", order_type: "stall", payment_method: "cash", total_amount: 100, items: [{ productId: ROSE, qty: 1, price: 100 }] }),
      order({ id: "p", status: "pending_payment", payment_method: "bit", total_amount: 100, items: [{ productId: ROSE, qty: 1, price: 100 }] }),
      // last week (Sun 2026-10-25)
      order({ id: "c", created_at: "2026-10-27T10:00:00Z", payment_method: "paybox", total_amount: 300, items: [{ productId: ROSE, qty: 3, price: 100 }] }),
      // two weeks ago (Sun 2026-10-18), legacy stall sale
      order({ id: "d", created_at: "2026-10-23T08:00:00Z", customer_name: "לקוח דוכן", payment_method: "cash", total_amount: 50, items: [{ productId: ROSE, qty: 1, price: 50 }] }),
    ],
    products: [{ id: ROSE, title: "ורדים", cost_price: 40 }],
    expenses: [
      { amount: 10, expense_type: "recurring", expense_date: "2026-10-01", is_active: true },
      { amount: 25, expense_type: "one_time", expense_date: "2026-10-27" },
    ],
    employees: [{ id: "w1", full_name: "דנה", role: "worker", pay_type: "hourly", pay_rate: 50 }],
    shifts: [
      { employee_id: "w1", work_date: "2026-11-02", start_time: "08:00:00", end_time: "10:00:00" },
      { employee_id: "w1", work_date: "2026-11-06", start_time: "08:00:00", end_time: "10:00:00" },
      { employee_id: "w1", work_date: "2026-10-28", start_time: "08:00:00", end_time: "12:00:00" },
    ],
    payrollSnapshots: [],
    businessWeeks: [],
    supplierLines: [],
  };
}

describe("weekly money report", () => {
  it("builds one row per week, newest first, payroll from the schedule", () => {
    const weeks = buildMoneyReport(moneyInput());
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-11-01", "2026-10-25", "2026-10-18"]);

    const [cur, last, older] = weeks;
    expect(cur.isCurrent).toBe(true);
    // revenue counts every non-cancelled order (pending included)
    expect(cur.finance.revenue).toMatchObject({ website: 300, stalls: 100, total: 400 });
    expect(cur.finance.supplierCost).toBe(160);
    expect(cur.finance.expenses.total).toBe(10);
    // the week's pay is committed: the whole schedule counts (4h × 50)
    expect(cur.finance.payroll).toBe(200);
    expect(cur.payrollScheduled).toBe(200);
    expect(cur.finance.netProfit).toBe(400 - 160 - 10 - 200);

    expect(last.finance.revenue.total).toBe(300);
    expect(last.finance.expenses.total).toBe(35);
    expect(last.finance.payroll).toBe(200);
    expect(last.finance.netProfit).toBe(300 - 120 - 35 - 200);

    expect(older.finance.revenue.stalls).toBe(50);
    expect(older.finance.payroll).toBe(0);
  });

  it("sums weeks into totals with averages", () => {
    const t = sumWeeks(buildMoneyReport(moneyInput()));
    expect(t.weeks).toBe(3);
    expect(t.revenue.total).toBe(750);
    expect(t.payroll).toBe(400);
    expect(t.expenses).toBe(55);
    expect(t.ordersCount).toBe(5);
    expect(t.avgOrder).toBe(150);
    expect(t.net).toBe(30 - 55 + 0);
    expect(t.avgRevenuePerWeek).toBe(250);
  });

  it("builds the overview: payments, this month, all time and best sellers", () => {
    const o = buildMoneyOverview({ ...moneyInput(), recent: 2, since: "2026-10-23" });
    expect(o.recent).toHaveLength(2);
    expect(o.current?.weekStart).toBe("2026-11-01");
    expect(o.payments.week).toMatchObject({ bit: 200, cash: 100, paybox: 0, total: 300, pending: { count: 1, amount: 100 } });
    expect(o.payments.allTime).toMatchObject({ bit: 200, cash: 150, paybox: 300, total: 650 });
    // November: only the week of Sun 2026-11-01
    expect(o.thisMonth.month).toBe("2026-11");
    expect(o.thisMonth.weeks).toBe(1);
    expect(o.allTime.weeks).toBe(3);
    expect(o.allTime.since).toBe("2026-10-23");
    expect(o.bestSellers.website[0]).toMatchObject({ product_id: ROSE, units: 6 });
    expect(o.bestSellers.stalls[0]).toMatchObject({ product_id: ROSE, units: 2 });
  });

  it("counts the weeks since the first order", () => {
    const cur = currentBusinessWeek(SETTINGS, NOW);
    expect(weeksSince("2026-10-23", cur, SETTINGS)).toBe(3);
    expect(weeksSince("2026-11-02", cur, SETTINGS)).toBe(1);
    expect(weeksSince(null, cur, SETTINGS)).toBe(1);
    expect(weeksSince("2020-01-01", cur, SETTINGS, 52)).toBe(52);
  });
});

describe("expenseSummary", () => {
  it("counts recurring × the weeks each was active, plus one-time", () => {
    const s = expenseSummary(
      [
        // starts Wed 2026-10-14 → weeks of 10-11, 10-18, 10-25, 11-01 = 4 weeks
        { amount: 100, category: "rent", expense_type: "recurring", expense_date: "2026-10-14", is_active: true },
        // starts in the current week → 1 week
        { amount: 20, category: "fuel", expense_type: "recurring", expense_date: "2026-11-03", is_active: true },
        { amount: 50, category: "fuel", expense_type: "one_time", expense_date: "2026-10-20" },
        { amount: 30, category: "packaging", expense_type: "one_time", expense_date: "2026-11-02" },
        // inactive recurring never counts (same rule as the weekly reports)
        { amount: 999, category: "other", expense_type: "recurring", expense_date: "2026-10-01", is_active: false },
        // future one-time is not "so far"
        { amount: 70, category: "other", expense_type: "one_time", expense_date: "2026-12-01" },
      ],
      "2026-11-01",
      "2026-11-04",
    );
    expect(s.since).toBe("2026-10-14");
    expect(s.weeks).toBe(4);
    expect(s.recurring).toBe(4 * 100 + 20);
    expect(s.oneTime).toBe(80);
    expect(s.total).toBe(500);
    expect(s.thisWeek).toEqual({ recurring: 120, oneTime: 30, total: 150 });
    expect(s.recurringPerWeek).toBe(120);
    expect(s.thisMonth).toBe(150);
    expect(s.byCategory).toEqual([
      { category: "rent", amount: 400 },
      { category: "fuel", amount: 70 },
      { category: "packaging", amount: 30 },
    ]);
  });

  it("is empty without expenses", () => {
    const s = expenseSummary([], "2026-11-01", "2026-11-04");
    expect(s.total).toBe(0);
    expect(s.weeks).toBe(0);
    expect(s.byCategory).toEqual([]);
  });
});
