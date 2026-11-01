import { describe, expect, it } from "vitest";
import { isPreorderClosingDue, parseConfig, refs, selectPreorderClosing, selectWinBack } from "./automations";
import type { CustomerStat } from "./segments";

// Defaults: supplier order Tuesday 12:00, week closes Saturday 21:00 (Israel).
// Week of Sunday 2026-11-01. Israel is UTC+2 in November, so the order is 2026-11-03T10:00Z.
const S = { supplier_order_day: 2, supplier_order_time: "12:00", week_close_day: 6, week_close_time: "21:00" };

describe("isPreorderClosingDue", () => {
  it("is due inside the window before the supplier order", () => {
    expect(isPreorderClosingDue(S, 6, new Date("2026-11-03T04:00:00Z")).due).toBe(true);
    expect(isPreorderClosingDue(S, 6, new Date("2026-11-03T09:59:00Z")).due).toBe(true);
  });
  it("is not due before the window", () => {
    expect(isPreorderClosingDue(S, 6, new Date("2026-11-03T03:59:00Z")).due).toBe(false);
    expect(isPreorderClosingDue(S, 6, new Date("2026-11-01T08:00:00Z")).due).toBe(false);
  });
  it("is not due once the supplier order time has passed", () => {
    expect(isPreorderClosingDue(S, 6, new Date("2026-11-03T10:00:00Z")).due).toBe(false);
    expect(isPreorderClosingDue(S, 6, new Date("2026-11-05T10:00:00Z")).due).toBe(false);
  });
  it("reports the window and week", () => {
    const { window } = isPreorderClosingDue(S, 24, new Date("2026-11-02T12:00:00Z"));
    expect(window.week.weekStart).toBe("2026-11-01");
    expect(window.sendUntil.toISOString()).toBe("2026-11-03T10:00:00.000Z");
    expect(window.sendFrom.toISOString()).toBe("2026-11-02T10:00:00.000Z");
  });
  it("after the week closes it targets next week's order", () => {
    // Saturday 2026-11-07 21:30 Israel → next week (Sunday 11-08), order Tue 11-10.
    const r = isPreorderClosingDue(S, 6, new Date("2026-11-07T19:30:00Z"));
    expect(r.window.week.weekStart).toBe("2026-11-08");
    expect(r.window.sendUntil.toISOString()).toBe("2026-11-10T10:00:00.000Z");
    expect(r.due).toBe(false);
    // A 72h window for next week's order already opens on Saturday morning UTC.
    expect(isPreorderClosingDue(S, 72, new Date("2026-11-07T19:30:00Z")).due).toBe(true);
    expect(isPreorderClosingDue(S, 72, new Date("2026-11-07T10:00:00Z")).window.week.weekStart).toBe("2026-11-01");
  });
  it("respects a custom supplier order day/time", () => {
    const wed = { ...S, supplier_order_day: 3, supplier_order_time: "09:30" };
    // Wednesday 2026-11-04 09:30 Israel = 07:30Z
    expect(isPreorderClosingDue(wed, 2, new Date("2026-11-04T05:30:00Z")).due).toBe(true);
    expect(isPreorderClosingDue(wed, 2, new Date("2026-11-04T05:29:00Z")).due).toBe(false);
  });
});

describe("parseConfig", () => {
  it("falls back to defaults on bad input", () => {
    expect(parseConfig("preorder_closing", { hours_before: 500 })).toEqual({ hours_before: 6 });
    expect(parseConfig("win_back", null)).toEqual({ weeks: 6 });
    expect(parseConfig("win_back", { weeks: 3 })).toEqual({ weeks: 3 });
  });
});

const NOW = new Date("2026-11-01T12:00:00Z");
const weeksAgo = (w: number) => new Date(NOW.getTime() - w * 7 * 86_400_000).toISOString();
const cust = (over: Partial<CustomerStat>): CustomerStat => ({
  id: "x",
  name: null,
  phone: "972501234567",
  optedIn: true,
  isManualRegular: false,
  orderCount: 1,
  firstOrderAt: null,
  lastOrderAt: null,
  ...over,
});

describe("selectWinBack", () => {
  it("picks opted-in customers whose last order is older than N weeks", () => {
    const list = selectWinBack(
      [
        cust({ id: "lapsed", lastOrderAt: weeksAgo(8) }),
        cust({ id: "active", lastOrderAt: weeksAgo(2) }),
        cust({ id: "never", lastOrderAt: null, orderCount: 0 }),
        cust({ id: "optout", lastOrderAt: weeksAgo(8), optedIn: false }),
        cust({ id: "nophone", lastOrderAt: weeksAgo(8), phone: null }),
      ],
      6,
      NOW,
    );
    expect(list.map((c) => c.id)).toEqual(["lapsed"]);
  });
  it("one win-back per lapse (the ref changes only after a new order)", () => {
    expect(refs.winBack("u1", "2026-08-01T10:00:00Z")).toBe("win_back:u1:2026-08-01");
    expect(refs.winBack("u1", "2026-08-01T22:00:00Z")).toBe(refs.winBack("u1", "2026-08-01T10:00:00Z"));
  });
});

describe("selectPreorderClosing", () => {
  it("skips customers who already ordered this week", () => {
    const weekStart = new Date("2026-10-31T22:00:00Z");
    const list = selectPreorderClosing(
      [
        cust({ id: "ordered", lastOrderAt: "2026-11-01T08:00:00Z" }),
        cust({ id: "old", lastOrderAt: "2026-10-20T08:00:00Z" }),
        cust({ id: "new", lastOrderAt: null, orderCount: 0 }),
      ],
      weekStart,
    );
    expect(list.map((c) => c.id)).toEqual(["old", "new"]);
  });
  it("refs are per week and customer", () => {
    expect(refs.preorderClosing("2026-11-01", "u")).toBe("preorder_closing:2026-11-01:u");
    expect(refs.orderThanks("o1")).toBe("order_thanks:o1");
  });
});
