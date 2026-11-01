import { describe, expect, it } from "vitest";
import { computeAnalytics, resolvePeriod, weekStartOfDate, weekStartOfInstant, weeksBetween } from "./analytics";

describe("weeks", () => {
  it("week starts on Sunday (Israel date)", () => {
    expect(weekStartOfDate("2026-11-04")).toBe("2026-11-01");
    expect(weekStartOfDate("2026-11-01")).toBe("2026-11-01");
    // Saturday 21:30Z is still Saturday (23:30) in Israel; 22:30Z is already Sunday.
    expect(weekStartOfInstant("2026-11-07T21:30:00Z")).toBe("2026-11-01");
    expect(weekStartOfInstant("2026-11-07T22:30:00Z")).toBe("2026-11-08");
    expect(weeksBetween("2026-10-14", "2026-11-02")).toEqual(["2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"]);
  });
});

describe("resolvePeriod", () => {
  const now = new Date("2026-11-04T10:00:00Z");
  it("this week / last 4 weeks / custom", () => {
    expect(resolvePeriod("week", null, null, now)).toEqual({ from: "2026-11-01", to: "2026-11-04" });
    expect(resolvePeriod("4weeks", null, null, now)).toEqual({ from: "2026-10-11", to: "2026-11-04" });
    expect(resolvePeriod("custom", "2026-01-01", "2026-02-01", now)).toEqual({ from: "2026-01-01", to: "2026-02-01" });
  });
  it("rejects bad custom ranges", () => {
    expect(resolvePeriod("custom", "2026-02-01", "2026-01-01", now)).toBeNull();
    expect(resolvePeriod("custom", "2024-01-01", "2026-01-01", now)).toBeNull();
    expect(resolvePeriod("custom", "x", "2026-01-01", now)).toBeNull();
    expect(resolvePeriod("year", null, null, now)).toBeNull();
  });
});

describe("computeAnalytics", () => {
  it("aggregates visits, signups, orders, sources and customers", () => {
    const r = computeAnalytics({
      from: "2026-11-01",
      to: "2026-11-04",
      visits: [
        { session_id: "s1", created_at: "2026-11-01T08:00:00Z", tracking_link_id: "L1" },
        { session_id: "s1", created_at: "2026-11-01T09:00:00Z", tracking_link_id: "L1" },
        { session_id: "s2", created_at: "2026-11-02T08:00:00Z", tracking_link_id: null },
        { session_id: "s3", created_at: "2026-11-02T08:00:00Z", tracking_link_id: "deleted" },
        { session_id: "s4", created_at: "2026-11-03T08:00:00Z", tracking_link_id: null },
      ],
      signups: [{ created_at: "2026-11-02T08:00:00Z", signup_link_id: "L1" }],
      orders: [
        {
          id: "o1",
          user_id: "u1",
          customer_phone: null,
          created_at: "2026-11-02T08:00:00Z",
          status: "approved",
          items: [{ title: "ורדים", qty: 2 }],
          tracking_link_id: "L1",
          order_type: "preorder",
        },
        {
          id: "o2",
          user_id: null,
          customer_phone: "0501111111",
          created_at: "2026-11-03T08:00:00Z",
          status: "completed",
          items: [
            { title: "ורדים", qty: 1 },
            { title: "חמניות", qty: 5 },
          ],
          tracking_link_id: null,
          order_type: "live",
        },
        {
          id: "o3",
          user_id: null,
          customer_phone: null,
          created_at: "2026-11-03T08:00:00Z",
          status: "completed",
          items: [{ title: "ורדים", qty: 9 }],
          tracking_link_id: null,
          order_type: "stall",
        },
        {
          id: "o4",
          user_id: "u2",
          customer_phone: null,
          created_at: "2026-11-03T09:00:00Z",
          status: "cancelled",
          items: [],
          tracking_link_id: null,
          order_type: "preorder",
        },
      ],
      priorCustomerKeys: new Set(["p:972501111111"]),
      links: [{ id: "L1", name: "פלאייר" }],
    });
    expect(r.totals).toEqual({ visits: 4, newUsers: 1, orders: 2, conversionPct: 50 });
    expect(r.weeks).toEqual([{ weekStart: "2026-11-01", visits: 4, newUsers: 1, orders: 2 }]);
    expect(r.customers).toEqual({ new: 1, returning: 1 });
    expect(r.topProducts).toEqual([
      { title: "חמניות", qty: 5 },
      { title: "ורדים", qty: 3 },
    ]);
    expect(r.sources.find((s) => s.linkId === "L1")).toMatchObject({ name: "פלאייר", visits: 1, signups: 1, orders: 1 });
    expect(r.sources.find((s) => s.linkId === null)).toMatchObject({ name: "ישיר", visits: 3, orders: 1 });
    // No personal data in the result.
    expect(JSON.stringify(r)).not.toMatch(/0501111111|972501111111|u1/);
  });
});
