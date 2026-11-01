import { describe, expect, it } from "vitest";
import { addDays, businessWeekOf, currentBusinessWeek, israelDate, israelTimeToDate } from "./week";
import { computeEarnings } from "./payroll";

const S = { supplier_order_day: 2, supplier_order_time: "12:00", week_close_day: 6, week_close_time: "21:00" };

describe("business week", () => {
  it("converts Israel wall time in winter (+2) and summer (+3)", () => {
    expect(israelTimeToDate("2026-01-06", 12 * 60).toISOString()).toBe("2026-01-06T10:00:00.000Z");
    expect(israelTimeToDate("2026-07-07", 12 * 60).toISOString()).toBe("2026-07-07T09:00:00.000Z");
  });

  it("is in pre-order before Tuesday 12:00 and live after", () => {
    const mon = currentBusinessWeek(S, new Date("2026-11-02T08:00:00Z")); // Mon 10:00 IL
    expect(mon.weekStart).toBe("2026-11-01");
    expect(mon.phase).toBe("preorder");
    const tue = currentBusinessWeek(S, new Date("2026-11-03T10:30:00Z")); // Tue 12:30 IL
    expect(tue.weekStart).toBe("2026-11-01");
    expect(tue.phase).toBe("live");
  });

  it("rolls to the next week after Saturday close", () => {
    const sat = currentBusinessWeek(S, new Date("2026-11-07T19:30:00Z")); // Sat 21:30 IL
    expect(sat.weekStart).toBe("2026-11-08");
    expect(sat.phase).toBe("preorder");
  });

  it("uses the Israel date near midnight UTC", () => {
    expect(israelDate(new Date("2026-11-01T22:30:00Z"))).toBe("2026-11-02");
  });

  it("finds the week of any date", () => {
    expect(businessWeekOf("2026-11-05", S).weekStart).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("payroll", () => {
  const shifts = [
    { employee_id: "a", start_time: "08:00", end_time: "14:30" },
    { employee_id: "a", start_time: "09:00:00", end_time: "13:00:00" },
    { employee_id: "b", start_time: "08:00", end_time: "12:00" },
  ];

  it("pays hourly and per shift for work outside the budget", () => {
    expect(computeEarnings({ id: "a", role: "worker", pay_type: "hourly", pay_rate: 40 }, shifts, 0).amount).toBe(420);
    expect(computeEarnings({ id: "a", role: "worker", pay_type: "per_shift", pay_rate: 150 }, shifts, 0).amount).toBe(300);
  });

  it("pays stall and courier work only from the budget allocation", () => {
    const mixed = [
      { employee_id: "a", start_time: "08:00", end_time: "14:00", shift_type: "stall" },
      { employee_id: "a", start_time: "06:00", end_time: "08:00", shift_type: "supply" },
      { employee_id: "a", start_time: "15:00", end_time: "17:00", shift_type: "courier" },
    ];
    const e = computeEarnings({ id: "a", role: "worker", pay_type: "hourly", pay_rate: 40 }, mixed, 5, 250);
    expect(e.hours).toBe(10);
    expect(e.fromBudget).toBe(250);
    expect(e.amount).toBe(2 * 40 + 250); // only the supply shift by rate
    // Deliveries are never paid by rate any more.
    expect(computeEarnings({ id: "b", role: "worker", pay_type: "per_delivery", pay_rate: 12 }, shifts, 7).amount).toBe(0);
  });

  it("never pays owners, even with an allocation", () => {
    expect(computeEarnings({ id: "a", role: "owner", pay_type: "hourly", pay_rate: 40 }, shifts, 0, 100).amount).toBe(0);
  });
});
