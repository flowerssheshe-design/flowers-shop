import { describe, expect, it } from "vitest";
import { canDecideDistribution } from "./distribution";
import { weekStartsInSpan } from "./ranges";

describe("who decides the stall distribution", () => {
  it("owners and ops managers may save it", () => {
    expect(canDecideDistribution({ role: "owner", work_types: [] })).toBe(true);
    expect(canDecideDistribution({ role: "ops_manager", work_types: [] })).toBe(true);
    expect(canDecideDistribution({ role: "marketing", roles: ["marketing", "ops_manager"], work_types: [] })).toBe(true);
  });

  it("pickup workers and couriers only see it", () => {
    expect(canDecideDistribution({ role: "worker", work_types: ["supply_runner"] })).toBe(false);
    expect(canDecideDistribution({ role: "worker", work_types: ["courier"] })).toBe(false);
    expect(canDecideDistribution({ role: "worker", roles: [], work_types: ["supply_runner", "courier", "stall_seller"] })).toBe(false);
    expect(canDecideDistribution({ role: "marketing", roles: ["marketing"], work_types: ["supply_runner"] })).toBe(false);
  });
});

describe("week starts in a month", () => {
  it("lists the business-week starts that fall in the span", () => {
    // November 2026: Sundays 1, 8, 15, 22, 29.
    expect(weekStartsInSpan("2026-11-15", "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);
    // February 2026: Sundays 1, 8, 15, 22.
    expect(weekStartsInSpan("2026-03-01", "2026-02-01", "2026-02-28")).toHaveLength(4);
  });
});
