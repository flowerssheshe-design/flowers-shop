import { describe, expect, it } from "vitest";
import { canReceiveBudget, checkAllocations, type BudgetCandidate } from "./budget";
import { checkOpsEmployeeInput, isOpsManageable } from "./team";
import { allocatedTotal, unallocated } from "@/lib/staff/payroll";
import { budgetRemainderLine, computePayroll } from "@/lib/staff/owner/week-math";
import { payrollSnapshots } from "@/lib/staff/owner/week-close";

const people: BudgetCandidate[] = [
  { id: "seller", role: "worker", work_types: ["stall_seller"], is_active: true },
  { id: "courier", role: "worker", work_types: ["courier"], is_active: true },
  { id: "runner", role: "worker", work_types: ["supply_runner"], is_active: true },
  { id: "ops", role: "ops_manager", work_types: [], is_active: true },
  { id: "owner", role: "owner", work_types: [], is_active: true },
  { id: "gone", role: "worker", work_types: ["stall_seller"], is_active: false },
];
const byId = new Map(people.map((p) => [p.id, p]));

describe("weekly budget split", () => {
  it("only stall sellers, couriers and the shift manager can get a share", () => {
    expect(people.filter(canReceiveBudget).map((p) => p.id)).toEqual(["seller", "courier", "ops"]);
  });

  it("accepts a split up to the budget, including the manager himself", () => {
    const r = checkAllocations(500, [
      { employee_id: "seller", amount: 200 },
      { employee_id: "courier", amount: 150 },
      { employee_id: "ops", amount: 150 },
    ], byId);
    expect(r).toEqual({ ok: true, total: 500 });
  });

  it("refuses going over the budget, a missing budget, owners and duplicates", () => {
    expect(checkAllocations(300, [{ employee_id: "seller", amount: 300.01 }], byId).ok).toBe(false);
    expect(checkAllocations(null, [{ employee_id: "seller", amount: 10 }], byId).ok).toBe(false);
    expect(checkAllocations(500, [{ employee_id: "owner", amount: 10 }], byId).ok).toBe(false);
    expect(checkAllocations(500, [{ employee_id: "runner", amount: 10 }], byId).ok).toBe(false);
    expect(
      checkAllocations(500, [
        { employee_id: "seller", amount: 10 },
        { employee_id: "seller", amount: 10 },
      ], byId).ok,
    ).toBe(false);
  });

  it("counts the unsplit part as a cost line that is never snapshotted", () => {
    const budget = { amount: 500, allocations: new Map([["seller", 200]]) };
    expect(allocatedTotal(budget)).toBe(200);
    expect(unallocated(budget)).toBe(300);
    expect(budgetRemainderLine(budget)?.amount).toBe(300);

    const lines = computePayroll(
      [{ id: "seller", full_name: "מוכר", role: "worker", pay_type: null, pay_rate: null }],
      [],
      new Map(),
      undefined,
      budget,
    );
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(500);
    expect(payrollSnapshots("2026-11-01", lines).map((s) => s.employee_id)).toEqual(["seller"]);
  });
});

describe("shift manager and employees", () => {
  it("may manage only stall sellers and couriers", () => {
    expect(isOpsManageable({ role: "worker", work_types: ["stall_seller", "courier"] })).toBe(true);
    expect(isOpsManageable({ role: "worker", work_types: ["stall_seller", "supply_runner"] })).toBe(false);
    expect(isOpsManageable({ role: "ops_manager", work_types: [] })).toBe(false);
    expect(isOpsManageable({ role: "worker", work_types: [] })).toBe(false);
  });

  it("may not set roles, other work types or pay", () => {
    expect(checkOpsEmployeeInput({ role: "worker", work_types: ["courier"] })).toBeNull();
    expect(checkOpsEmployeeInput({ role: "owner" })).not.toBeNull();
    expect(checkOpsEmployeeInput({ work_types: ["supply_runner"] })).not.toBeNull();
    expect(checkOpsEmployeeInput({ work_types: [] })).not.toBeNull();
    expect(checkOpsEmployeeInput({ pay_type: "hourly", pay_rate: 40 })).not.toBeNull();
    expect(checkOpsEmployeeInput({ pay_type: null, pay_rate: null })).toBeNull();
  });
});

describe("multiple responsibilities", () => {
  it("stores the highest responsibility as the primary role", async () => {
    const { resolveRoles } = await import("./team");
    expect(resolveRoles({ roles: ["marketing", "ops_manager"] })).toEqual({ roles: ["ops_manager", "marketing"], role: "ops_manager" });
    expect(resolveRoles({ roles: [] })).toEqual({ roles: [], role: "worker" });
    expect(resolveRoles({ role: "owner" })).toEqual({ roles: ["owner"], role: "owner" });
    expect(resolveRoles({}, { role: "marketing", roles: null })).toEqual({ roles: ["marketing"], role: "marketing" });
  });

  it("a marketing lead with stall work can be scheduled and paid from the budget", async () => {
    const { canWorkShift } = await import("./schedule");
    const m = { id: "m", role: "marketing" as const, work_types: ["stall_seller"], is_active: true };
    expect(canWorkShift(m, "stall")).toBe(true);
    expect(canWorkShift(m, "courier")).toBe(false);
    expect(canReceiveBudget(m)).toBe(true);
  });
});
