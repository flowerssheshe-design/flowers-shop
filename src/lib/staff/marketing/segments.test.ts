import { describe, expect, it } from "vitest";
import { buildCustomerStats, inSegment, selectRecipients, toIntlPhone, type CustomerStat } from "./segments";

const NOW = new Date("2026-11-01T12:00:00Z");
const weeksAgo = (w: number) => new Date(NOW.getTime() - w * 7 * 86_400_000).toISOString();

function c(over: Partial<CustomerStat>): CustomerStat {
  return {
    id: "u",
    name: "x",
    phone: "972501111111",
    optedIn: true,
    isManualRegular: false,
    orderCount: 0,
    firstOrderAt: null,
    lastOrderAt: null,
    ...over,
  };
}

describe("toIntlPhone", () => {
  it("normalizes israeli numbers", () => {
    expect(toIntlPhone("050-123 4567")).toBe("972501234567");
    expect(toIntlPhone("+972 50 123 4567")).toBe("972501234567");
    expect(toIntlPhone("123")).toBeNull();
    expect(toIntlPhone(null)).toBeNull();
  });
});

describe("buildCustomerStats", () => {
  it("matches orders by user id or by phone (guest checkout), ignoring cancelled", () => {
    const stats = buildCustomerStats(
      [
        { id: "a", full_name: "A", phone: "0501111111", notification_opt_in: true },
        { id: "b", full_name: "B", phone: null, notification_opt_in: false, customer_status: "returning" },
      ],
      [
        { user_id: "a", customer_phone: "x", created_at: weeksAgo(10), status: "completed" },
        { user_id: null, customer_phone: "050-111-1111", created_at: weeksAgo(1), status: "approved" },
        { user_id: "a", customer_phone: null, created_at: weeksAgo(0), status: "cancelled" },
        { user_id: "zzz", customer_phone: null, created_at: weeksAgo(0), status: "approved" },
      ],
    );
    const a = stats.find((s) => s.id === "a")!;
    expect(a.orderCount).toBe(2);
    expect(a.firstOrderAt).toBe(weeksAgo(10));
    expect(a.lastOrderAt).toBe(weeksAgo(1));
    const b = stats.find((s) => s.id === "b")!;
    expect(b.optedIn).toBe(false);
    expect(b.isManualRegular).toBe(true);
    expect(b.orderCount).toBe(0);
  });
});

describe("segments", () => {
  const recent = c({ id: "recent", orderCount: 1, lastOrderAt: weeksAgo(1) });
  const old = c({ id: "old", orderCount: 5, lastOrderAt: weeksAgo(10) });
  const never = c({ id: "never" });
  const manual = c({ id: "manual", isManualRegular: true, orderCount: 1, lastOrderAt: weeksAgo(2) });

  it("all", () => {
    expect([recent, old, never, manual].every((x) => inSegment(x, { kind: "all" }, NOW, 3))).toBe(true);
  });
  it("ordered recently (N weeks)", () => {
    expect(inSegment(recent, { kind: "ordered_recently", weeks: 4 }, NOW, 3)).toBe(true);
    expect(inSegment(old, { kind: "ordered_recently", weeks: 4 }, NOW, 3)).toBe(false);
    expect(inSegment(old, { kind: "ordered_recently", weeks: 12 }, NOW, 3)).toBe(true);
    expect(inSegment(never, { kind: "ordered_recently", weeks: 52 }, NOW, 3)).toBe(false);
  });
  it("never ordered", () => {
    expect(inSegment(never, { kind: "never_ordered" }, NOW, 3)).toBe(true);
    expect(inSegment(recent, { kind: "never_ordered" }, NOW, 3)).toBe(false);
  });
  it("regulars: by threshold or manual flag", () => {
    expect(inSegment(old, { kind: "regulars" }, NOW, 3)).toBe(true);
    expect(inSegment(recent, { kind: "regulars" }, NOW, 3)).toBe(false);
    expect(inSegment(manual, { kind: "regulars" }, NOW, 3)).toBe(true);
    expect(inSegment(recent, { kind: "regulars" }, NOW, 1)).toBe(true);
  });
  it("lapsed", () => {
    expect(inSegment(old, { kind: "lapsed", weeks: 6 }, NOW, 3)).toBe(true);
    expect(inSegment(recent, { kind: "lapsed", weeks: 6 }, NOW, 3)).toBe(false);
    expect(inSegment(never, { kind: "lapsed", weeks: 6 }, NOW, 3)).toBe(false);
  });
  it("recipients: opted-in, with phone, no duplicate phones", () => {
    const list = selectRecipients(
      [
        c({ id: "1" }),
        c({ id: "2", optedIn: false, phone: "972502222222" }),
        c({ id: "3", phone: null }),
        c({ id: "4" }), // same phone as 1
        c({ id: "5", phone: "972503333333" }),
      ],
      { kind: "all" },
      NOW,
      3,
    );
    expect(list.map((x) => x.id)).toEqual(["1", "5"]);
  });
});
