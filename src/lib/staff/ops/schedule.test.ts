import { describe, expect, it } from "vitest";
import { canBeWeekCourier, canWorkShift, eligibleFor, findOverlaps, hhmm, overlappingIds, shiftsOverlap } from "./schedule";

const base = { employee_id: "e1", work_date: "2026-11-06" };

describe("shift overlap", () => {
  it("detects intersecting times for the same employee and day", () => {
    expect(shiftsOverlap({ ...base, start_time: "08:00", end_time: "12:00" }, { ...base, start_time: "11:00", end_time: "14:00" })).toBe(true);
    expect(shiftsOverlap({ ...base, start_time: "08:00", end_time: "16:00" }, { ...base, start_time: "10:00", end_time: "11:00" })).toBe(true);
  });

  it("touching edges are not an overlap", () => {
    expect(shiftsOverlap({ ...base, start_time: "08:00", end_time: "12:00" }, { ...base, start_time: "12:00", end_time: "14:00" })).toBe(false);
  });

  it("handles HH:MM:SS from the DB", () => {
    expect(shiftsOverlap({ ...base, start_time: "08:00:00", end_time: "12:30:00" }, { ...base, start_time: "12:15", end_time: "13:00" })).toBe(true);
  });

  it("different employee or day never overlaps", () => {
    const a = { ...base, start_time: "08:00", end_time: "12:00" };
    expect(shiftsOverlap(a, { ...a, employee_id: "e2" })).toBe(false);
    expect(shiftsOverlap(a, { ...a, work_date: "2026-11-07" })).toBe(false);
  });

  it("a shift doesn't overlap itself (edit)", () => {
    const a = { ...base, id: "s1", start_time: "08:00", end_time: "12:00" };
    expect(findOverlaps(a, [a])).toEqual([]);
    expect(findOverlaps(a, [{ ...a, id: "s2" }])).toHaveLength(1);
  });

  it("overlappingIds marks both sides only", () => {
    const ids = overlappingIds([
      { ...base, id: "a", start_time: "08:00", end_time: "12:00" },
      { ...base, id: "b", start_time: "11:00", end_time: "13:00" },
      { ...base, id: "c", start_time: "13:00", end_time: "15:00" },
      { ...base, id: "d", employee_id: "e2", start_time: "08:00", end_time: "12:00" },
    ]);
    expect(Array.from(ids).sort()).toEqual(["a", "b"]);
  });

  it("hhmm trims seconds and pads", () => {
    expect(hhmm("08:00:00")).toBe("08:00");
    expect(hhmm("8:05")).toBe("08:05");
    expect(hhmm(null)).toBe("");
  });
});

describe("who can be scheduled", () => {
  const pool = [
    { id: "o", role: "owner" as const, work_types: [], is_active: true },
    { id: "m", role: "ops_manager" as const, work_types: [], is_active: true },
    { id: "s", role: "worker" as const, work_types: ["stall_seller"], is_active: true },
    { id: "c", role: "worker" as const, work_types: ["courier"], is_active: true },
    { id: "x", role: "worker" as const, work_types: ["courier"], is_active: false },
    { id: "k", role: "marketing" as const, work_types: [], is_active: true },
  ];

  it("filters by matching work type, always allowing owners and ops", () => {
    expect(eligibleFor(pool, "stall").map((p) => p.id)).toEqual(["o", "m", "s"]);
    expect(eligibleFor(pool, "courier").map((p) => p.id)).toEqual(["o", "m", "c"]);
    expect(eligibleFor(pool, "supply").map((p) => p.id)).toEqual(["o", "m"]);
  });

  it("never schedules inactive or marketing staff", () => {
    expect(canWorkShift(pool[4], "courier")).toBe(false);
    expect(canWorkShift(pool[5], "stall")).toBe(false);
  });

  it("courier of the week follows the courier rule", () => {
    expect(pool.filter(canBeWeekCourier).map((p) => p.id)).toEqual(["o", "m", "c"]);
  });
});
