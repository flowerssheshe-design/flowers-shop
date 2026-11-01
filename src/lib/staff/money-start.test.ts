import { describe, expect, it } from "vitest";
import { laterDate, moneyStartDate, moneyStartWeek } from "./money-start";
import { expenseSummary } from "./owner/money";
import { buildPaySummary } from "./owner/pay-summary";

describe("money start date", () => {
  it("reads the setting, or null for 'from the start'", () => {
    expect(moneyStartDate({ money_start_date: "2026-11-01" })).toBe("2026-11-01");
    expect(moneyStartDate({ money_start_date: "" })).toBeNull();
    expect(moneyStartDate({})).toBeNull();
    expect(moneyStartWeek({ money_start_date: "2026-11-04" })).toBe("2026-11-01");
    expect(laterDate("2026-09-17", "2026-11-01")).toBe("2026-11-01");
    expect(laterDate(null, "2026-11-01")).toBe("2026-11-01");
  });

  it("expenses count only from the start week", () => {
    const rows = [
      { amount: 250, category: "rent", expense_type: "recurring", expense_date: "2026-09-13", creation_date: "2026-09-13", is_active: true },
      { amount: 400, category: "equipment", expense_type: "one_time", expense_date: "2026-10-30", creation_date: "2026-10-23", is_active: true },
    ] as Parameters<typeof expenseSummary>[0];
    const all = expenseSummary(rows, "2026-11-01", "2026-11-01");
    const fresh = expenseSummary(rows, "2026-11-01", "2026-11-01", 520, "2026-11-01");
    expect(all.total).toBeGreaterThan(fresh.total);
    expect(fresh.weeks).toBe(1);
    expect(fresh.total).toBe(250); // only this week's rent, the gazebo was before the start
    expect(fresh.since).toBe("2026-11-01");
  });

  it("the pay summary ignores weeks before the start", () => {
    const line = (amount: number) => ({ employee_id: "e", full_name: "דותן", role: "worker", shifts: 1, hours: 5, deliveries: 0, amount, fromResponsibility: 0 });
    const linesByWeek = new Map([
      ["2026-10-25", [line(150)]],
      ["2026-11-01", [line(200)]],
    ]);
    const s = buildPaySummary({ currentWeekStart: "2026-11-01", linesByWeek, startWeek: "2026-11-01" });
    expect(s.weeks.map((w) => w.weekStart)).toEqual(["2026-11-01"]);
    expect(s.people[0].total).toBe(200);
  });
});
