import { describe, expect, it } from "vitest";
import {
  checkEmployeeChange,
  isDuplicatePhoneError,
  isLocked,
  payFieldsError,
  toTeamMember,
  viewEmployeeFor,
  workTypesForRole,
  type EmployeeRow,
} from "./team";

const row: EmployeeRow = {
  id: "e1",
  full_name: "דנה",
  phone: "0501234567",
  role: "worker",
  work_types: ["stall_seller", "bogus"],
  is_active: true,
  pay_type: "hourly",
  pay_rate: "45.50",
  failed_pin_attempts: 2,
  locked_until: null,
  last_login_at: "2026-10-01T10:00:00Z",
  pin_hash: "scrypt$secret",
};

const owner = { role: "owner" as const, work_types: [] };
const ops = { role: "ops_manager" as const, work_types: [] };

describe("pay-field stripping", () => {
  it("ops managers never get pay, lockout or PIN data", () => {
    const view = viewEmployeeFor(ops, row) as Record<string, unknown>;
    expect(Object.keys(view).sort()).toEqual(["full_name", "id", "is_active", "phone", "role", "roles", "work_types"]);
    expect(view).not.toHaveProperty("pay_type");
    expect(view).not.toHaveProperty("pay_rate");
    expect(view).not.toHaveProperty("pin_hash");
    expect(JSON.stringify(view)).not.toContain("45.5");
  });

  it("workers and marketing get the public view too", () => {
    expect(viewEmployeeFor({ role: "worker", work_types: ["courier"] }, row)).not.toHaveProperty("pay_rate");
    expect(viewEmployeeFor({ role: "marketing", work_types: [] }, row)).not.toHaveProperty("pay_type");
  });

  it("owners get pay as numbers but never the PIN hash", () => {
    const view = viewEmployeeFor(owner, row) as Record<string, unknown>;
    expect(view.pay_type).toBe("hourly");
    expect(view.pay_rate).toBe(45.5);
    expect(view.failed_pin_attempts).toBe(2);
    expect(view).not.toHaveProperty("pin_hash");
  });

  it("drops unknown work types", () => {
    expect(toTeamMember(row).work_types).toEqual(["stall_seller"]);
  });
});

describe("last owner / self guard", () => {
  const ownerA = { id: "a", role: "owner" as const, is_active: true };
  const ownerB = { id: "b", role: "owner" as const, is_active: true };

  it("blocks deactivating yourself", () => {
    expect(checkEmployeeChange({ actorId: "a", target: ownerA, change: { is_active: false }, activeOwnerIds: ["a", "b"] }))
      .toMatch(/עצמך/);
  });

  it("blocks demoting yourself", () => {
    expect(checkEmployeeChange({ actorId: "a", target: ownerA, change: { role: "ops_manager" }, activeOwnerIds: ["a", "b"] }))
      .toMatch(/עצמך/);
  });

  it("allows editing yourself without demotion", () => {
    expect(checkEmployeeChange({ actorId: "a", target: ownerA, change: { role: "owner", is_active: true }, activeOwnerIds: ["a"] }))
      .toBeNull();
    expect(checkEmployeeChange({ actorId: "a", target: ownerA, change: {}, activeOwnerIds: ["a"] })).toBeNull();
  });

  it("allows demoting another owner when one stays", () => {
    expect(checkEmployeeChange({ actorId: "a", target: ownerB, change: { role: "worker" }, activeOwnerIds: ["a", "b"] }))
      .toBeNull();
  });

  it("blocks removing the last active owner", () => {
    expect(checkEmployeeChange({ actorId: "x", target: ownerB, change: { is_active: false }, activeOwnerIds: ["b"] }))
      .toMatch(/לפחות מנהל ראשי/);
    expect(checkEmployeeChange({ actorId: "x", target: ownerB, change: { role: "ops_manager" }, activeOwnerIds: ["b"] }))
      .toMatch(/לפחות מנהל ראשי/);
  });

  it("ignores inactive owners and non-owners", () => {
    const inactiveOwner = { id: "c", role: "owner" as const, is_active: false };
    expect(checkEmployeeChange({ actorId: "a", target: inactiveOwner, change: { role: "worker" }, activeOwnerIds: ["a"] }))
      .toBeNull();
    const worker = { id: "w", role: "worker" as const, is_active: true };
    expect(checkEmployeeChange({ actorId: "a", target: worker, change: { is_active: false }, activeOwnerIds: ["a"] }))
      .toBeNull();
  });
});

describe("misc team helpers", () => {
  it("pay is never set from the employee form: points to the pay page", () => {
    expect(payFieldsError({ pay_type: "hourly", pay_rate: 50 })).toMatch(/דף שכר/);
    expect(payFieldsError({ responsibility_pay: 300 })).toMatch(/דף שכר/);
    expect(payFieldsError({ pay_rate: 0 })).toMatch(/דף שכר/);
    expect(payFieldsError({ pay_type: null, pay_rate: null, responsibility_pay: null })).toBeNull();
    expect(payFieldsError({})).toBeNull();
  });

  it("any responsibility may also have work types; duplicates collapse", () => {
    expect(workTypesForRole("marketing", ["courier"])).toEqual(["courier"]);
    expect(workTypesForRole("worker", ["courier", "courier"])).toEqual(["courier"]);
  });

  it("detects locks and duplicate phones", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(isLocked({ locked_until: "2026-11-01T10:05:00Z" }, now)).toBe(true);
    expect(isLocked({ locked_until: "2026-11-01T09:55:00Z" }, now)).toBe(false);
    expect(isLocked({ locked_until: null }, now)).toBe(false);
    expect(isDuplicatePhoneError({ code: "23505" })).toBe(true);
    expect(isDuplicatePhoneError({ code: "42P01", message: "relation missing" })).toBe(false);
    expect(isDuplicatePhoneError(null)).toBe(false);
  });
});
