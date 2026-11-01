import { describe, it, expect } from "vitest";
import { currentBusinessWeek } from "@/lib/staff/week";
import {
  buildDashboard,
  computeWeekFinance,
  orderChannel,
  weekWindow,
  type DashboardInput,
  type OrderRow,
} from "./week-math";

const SETTINGS = { supplier_order_day: 2, supplier_order_time: "12:00", week_close_day: 6, week_close_time: "21:00" };
const NOW = new Date("2026-11-04T08:00:00Z"); // Wednesday 10:00 Israel, after the supplier order
const ROSE = "rose";
const TULIP = "tulip";

function order(o: Partial<OrderRow> & { id: string }): OrderRow {
  return { created_at: "2026-11-02T10:00:00Z", status: "approved", order_type: "preorder", total_amount: 0, items: [], ...o };
}

function input(): DashboardInput {
  return {
    week: currentBusinessWeek(SETTINGS, NOW),
    settings: SETTINGS,
    now: NOW,
    orders: [
      order({ id: "o1", created_at: "2026-11-01T10:00:00Z", total_amount: 200, items: [{ productId: ROSE, title: "ורדים", qty: 2, price: 100 }] }),
      order({
        id: "o2",
        order_type: "live",
        status: "completed",
        created_at: "2026-11-04T07:00:00Z",
        total_amount: 100,
        items: [{ productId: TULIP, title: "צבעונים", qty: 1, price: 100 }],
        delivered_by: "c1",
        delivered_at: "2026-11-04T07:30:00Z",
      }),
      order({ id: "o3", order_type: "stall", stall_id: "s1", payment_method: "bit", total_amount: 150, items: [{ productId: ROSE, qty: 1, price: 150 }] }),
      // legacy stall sale: recognised by the placeholder customer name
      order({ id: "o4", customer_name: "לקוח דוכן", payment_method: "cash", total_amount: 80, items: [{ productId: TULIP, qty: 1, price: 80 }] }),
      order({ id: "o5", status: "cancelled", total_amount: 500, items: [{ productId: ROSE, qty: 5, price: 100 }] }),
      order({ id: "o6", created_at: "2026-10-31T18:00:00Z", total_amount: 999, items: [{ productId: ROSE, qty: 9, price: 111 }] }),
    ],
    products: [
      { id: ROSE, title: "ורדים", cost_price: 40 },
      { id: TULIP, title: "צבעונים", cost_price: 30 },
    ],
    expenses: [
      { amount: 50, expense_type: "one_time", expense_date: "2026-11-02" },
      { amount: 70, expense_type: "recurring", expense_date: "2026-10-01", is_active: true },
      { amount: 1000, expense_type: "one_time", expense_date: "2026-10-20" },
    ],
    employees: [
      { id: "w1", full_name: "דנה", role: "worker", pay_type: "hourly", pay_rate: 50 },
      { id: "c1", full_name: "יוסי", role: "worker", pay_type: "per_delivery", pay_rate: 20 },
      { id: "own", full_name: "בעלים", role: "owner", pay_type: "hourly", pay_rate: 100 },
    ],
    shifts: [
      { employee_id: "w1", work_date: "2026-11-03", start_time: "08:00:00", end_time: "12:00:00", shift_type: "supply" },
      { employee_id: "w1", work_date: "2026-11-04", start_time: "09:00:00", end_time: "11:00:00", shift_type: "stall", stall_id: "s1" },
      { employee_id: "w1", work_date: "2026-11-06", start_time: "08:00:00", end_time: "10:00:00", shift_type: "stall", stall_id: "s1" },
      { employee_id: "own", work_date: "2026-11-03", start_time: "08:00:00", end_time: "12:00:00", shift_type: "supply" },
      // next week: ignored
      { employee_id: "w1", work_date: "2026-11-08", start_time: "08:00:00", end_time: "18:00:00", shift_type: "supply" },
    ],
    stalls: [
      { id: "s1", name: "כיכר", is_open: false, sort_order: 1 },
      { id: "s2", name: "מרכז", is_open: false, sort_order: 2 },
      { id: "s3", name: "סגור", is_active: false },
    ],
    stallStock: [
      { stall_id: "s1", product_id: ROSE, stock: 3, initial_stock: 5 },
      { stall_id: "s1", product_id: TULIP, stock: 0, initial_stock: 2 },
    ],
    supplierLines: [],
    supplierOrderedAt: null,
  };
}

describe("week window and channels", () => {
  it("runs from the previous close to this close", () => {
    const win = weekWindow(currentBusinessWeek(SETTINGS, NOW), SETTINGS);
    expect(win.from.toISOString()).toBe("2026-10-31T19:00:00.000Z");
    expect(win.to.toISOString()).toBe("2026-11-07T19:00:00.000Z");
  });

  it("classifies orders", () => {
    expect(orderChannel(order({ id: "a", order_type: "live" }))).toBe("live");
    expect(orderChannel(order({ id: "b", order_type: "stall" }))).toBe("stall");
    expect(orderChannel(order({ id: "c", notes: "מכירה בדוכן" }))).toBe("stall");
    expect(orderChannel(order({ id: "d", order_type: "manual" }))).toBe("manual");
    expect(orderChannel(order({ id: "e", order_type: null }))).toBe("preorder");
  });
});

describe("buildDashboard", () => {
  const d = buildDashboard(input());

  it("reports the week and phase", () => {
    expect(d.week.weekStart).toBe("2026-11-01");
    expect(d.week.phase).toBe("live");
    expect(d.week.today).toBe("2026-11-04");
  });

  it("splits revenue, skips cancelled and out-of-window orders", () => {
    expect(d.finance.ordersCount).toBe(4);
    expect(d.finance.websiteOrdersCount).toBe(2);
    expect(d.finance.stallSalesCount).toBe(2);
    expect(d.finance.revenue).toEqual({ preorder: 200, live: 100, manual: 0, website: 300, stalls: 230, total: 530 });
  });

  it("uses sold cost before the supplier order is sent", () => {
    expect(d.finance.supplierCostBasis).toBe("sold");
    expect(d.finance.supplierCost).toBe(180);
  });

  it("counts this week's expenses only", () => {
    expect(d.finance.expenses).toEqual({ recurring: 70, oneTime: 50, total: 120 });
  });

  it("pays by rate only outside the budget (stall and courier come from the budget)", () => {
    expect(d.payroll.soFar).toBe(200); // the 4h supply shift × 50; stall hours and deliveries are budget work
    expect(d.payroll.scheduled).toBe(200);
    const own = d.team.find((t) => t.employee_id === "own");
    expect(own?.amount).toBe(0);
    expect(own?.hours).toBe(4);
    expect(d.team.find((t) => t.employee_id === "w1")).toMatchObject({ hours: 8, amount: 200, amountSoFar: 200 });
  });

  it("net profit so far = revenue − supplier − expenses − payroll so far", () => {
    expect(d.finance.payroll).toBe(200);
    expect(d.finance.netProfit).toBe(530 - 180 - 120 - 200);
  });

  it("summarises stalls: bit/cash, stock, Friday's workers", () => {
    expect(d.stalls.map((s) => s.id)).toEqual(["s1", "s2"]);
    const s1 = d.stalls[0];
    expect(s1.sales).toEqual({ count: 1, revenue: 150, bit: 150, cash: 0, other: 0 });
    expect(s1.stock.remaining).toBe(3);
    expect(s1.stock.initial).toBe(7);
    // Stalls work on Friday: the Friday (6.11) shift, not today's.
    expect(s1.workersToday).toEqual([{ employee_id: "w1", full_name: "דנה", start_time: "08:00", end_time: "10:00" }]);
    // "Open today" = a stall the seller actually opened (none in this fixture).
    expect(d.openToday).toEqual([]);
  });

  it("lists best sellers per channel", () => {
    expect(d.products.website).toEqual([
      { product_id: ROSE, title: "ורדים", units: 2, revenue: 200 },
      { product_id: TULIP, title: "צבעונים", units: 1, revenue: 100 },
    ]);
    expect(d.products.stalls.map((p) => [p.product_id, p.units, p.revenue])).toEqual([
      [ROSE, 1, 150],
      [TULIP, 1, 80],
    ]);
  });
});

describe("computeWeekFinance", () => {
  it("uses the supplier order cost once the order was sent", () => {
    const f = computeWeekFinance({
      weekStart: "2026-11-01",
      orders: [order({ id: "x", total_amount: 100, items: [{ productId: ROSE, qty: 1, price: 100 }] })],
      products: [{ id: ROSE, title: "ורדים", cost_price: 40 }],
      expenses: [],
      payroll: 10,
      supplierLines: [{ product_id: ROSE, preorder_qty: 1, extra_qty: 4, final_qty: 5 }],
      supplierOrdered: true,
    });
    expect(f.supplierCostBasis).toBe("order");
    expect(f.supplierCost).toBe(200);
    expect(f.netProfit).toBe(100 - 200 - 10);
  });
});
