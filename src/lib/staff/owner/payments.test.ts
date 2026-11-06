import { describe, expect, it } from "vitest";
import { applyPayExclusions, buildPaymentsView, exclusionKey } from "./payments";
import type { PayrollLine } from "./week-math";

const line = (id: string, amount: number, extra: Partial<PayrollLine> = {}): PayrollLine => ({
  employee_id: id,
  full_name: id,
  role: "worker",
  shifts: 1,
  hours: 5,
  deliveries: 0,
  amount,
  fromResponsibility: 0,
  ...extra,
});

describe("payments view", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const base = {
    currentWeekStart: "2026-11-01",
    names: new Map([["moshe", "משה"], ["yael", "יעל"]]),
    now,
  };

  it("lists what is due per week with its parts, minus what was paid", () => {
    const v = buildPaymentsView({
      ...base,
      linesByWeek: new Map([["2026-11-01", [line("moshe", 250, { fromEntries: 50 }), line("yael", 150, { fromResponsibility: 100 })]]]),
      entries: [{ id: "e1", week_start: "2026-11-01", employee_id: "moshe", description: "שעה נוספת", amount: 50 }],
      payments: [{ id: "p1", week_start: "2026-11-01", employee_id: "moshe", amount: 100, note: null, paid_at: "2026-11-06T10:00:00Z" }],
    });
    const w = v.weeks[0];
    const moshe = w.people.find((p) => p.employee_id === "moshe")!;
    expect(moshe.due).toBe(250);
    expect(moshe.paid).toBe(100);
    expect(moshe.left).toBe(150);
    expect(moshe.parts.map((p) => p.label)).toEqual(["שכר השבוע (1 משמרות, 5 שעות)", "שעה נוספת"]);
    const yael = w.people.find((p) => p.employee_id === "yael")!;
    expect(yael.parts.map((p) => p.amount)).toEqual([50, 100]);
    expect(w.left).toBe(300);
  });

  it("a one-off item added to a closed week counts in that week", () => {
    const v = buildPaymentsView({
      ...base,
      linesByWeek: new Map([["2026-10-25", [line("moshe", 200)]], ["2026-11-01", []]]),
      entries: [{ id: "e1", week_start: "2026-10-25", employee_id: "moshe", description: "בונוס", amount: 30 }],
      payments: [],
    });
    expect(v.weeks.find((w) => w.weekStart === "2026-10-25")!.people[0].due).toBe(230);
  });

  it("sums paid in the last 30 days, ever, and what is still owed", () => {
    const v = buildPaymentsView({
      ...base,
      linesByWeek: new Map([["2026-09-20", [line("moshe", 100)]], ["2026-11-01", [line("moshe", 200)]]]),
      entries: [],
      payments: [
        { id: "a", week_start: "2026-09-20", employee_id: "moshe", amount: 100, note: null, paid_at: "2026-09-25T10:00:00Z" },
        { id: "b", week_start: "2026-11-01", employee_id: "moshe", amount: 50, note: null, paid_at: "2026-11-05T10:00:00Z" },
      ],
    });
    expect(v.summary[0]).toMatchObject({ paidLast30: 50, paidAll: 150, owed: 150 });
    expect(v.totals).toEqual({ paidLast30: 50, paidAll: 150, owed: 150 });
  });
});

describe("✓/✗ on a pay part", () => {
  it("a skipped part is listed but not counted", () => {
    const v = buildPaymentsView({
      currentWeekStart: "2026-11-01",
      names: new Map([["yael", "יעל"]]),
      now: new Date("2026-11-06T12:00:00Z"),
      linesByWeek: new Map([["2026-11-01", [line("yael", 250, { fromResponsibility: 100 })]]]),
      entries: [],
      payments: [],
      exclusions: new Set([exclusionKey("2026-11-01", "yael", "responsibility")]),
    });
    const yael = v.weeks[0].people[0];
    expect(yael.due).toBe(150);
    expect(yael.parts.find((p) => p.key === "responsibility")?.excluded).toBe(true);
    expect(v.summary[0].owed).toBe(150);
  });
});

describe("skipped parts are no cost", () => {
  it("takes the ✗ parts out of the pay lines", () => {
    const out = applyPayExclusions(
      [line("yael", 300, { fromResponsibility: 100, fromEntries: 50 })],
      "2026-11-01",
      new Set([exclusionKey("2026-11-01", "yael", "responsibility"), exclusionKey("2026-11-01", "yael", "entry:e1")]),
      [{ id: "e1", week_start: "2026-11-01", employee_id: "yael", description: "בונוס", amount: 50 }],
    );
    expect(out[0].amount).toBe(150);
    expect(out[0].fromResponsibility).toBe(0);
    expect(out[0].fromEntries).toBe(0);
  });
});
