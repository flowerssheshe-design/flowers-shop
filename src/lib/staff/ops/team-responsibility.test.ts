import { describe, expect, it } from "vitest";
import { checkOpsEmployeeInput, isMissingColumnError, payFieldsError, toOwnerView, toTeamMember } from "./team";
import { EmployeeCreateSchema, EmployeeUpdateSchema } from "./schemas";

describe("responsibility pay in the team API", () => {
  it("is not set from the team API any more (the pay page sets it)", () => {
    expect(payFieldsError({ responsibility_pay: 400 })).not.toBeNull();
    expect(payFieldsError({ responsibility_pay: null })).toBeNull();
  });

  it("only owners see it", () => {
    const row = {
      id: "e",
      full_name: "מנהלת",
      phone: "0501234567",
      role: "ops_manager" as const,
      roles: ["ops_manager"],
      work_types: [],
      is_active: true,
      responsibility_pay: "300.00",
    };
    expect(toOwnerView(row).responsibility_pay).toBe(300);
    expect("responsibility_pay" in toTeamMember(row)).toBe(false);
  });

  it("the shift manager may not set it", () => {
    expect(checkOpsEmployeeInput({ responsibility_pay: 100 })).not.toBeNull();
    expect(checkOpsEmployeeInput({ responsibility_pay: null })).toBeNull();
  });

  it("schemas still read pay fields so the API can point to the pay page", () => {
    const base = { full_name: "דנה", phone: "0501234567", pin: "1234", pin_confirm: "1234" };
    const created = EmployeeCreateSchema.safeParse({ ...base, responsibility_pay: 300 });
    expect(created.success && payFieldsError(created.data)).toMatch(/דף שכר/);
    const updated = EmployeeUpdateSchema.safeParse({ responsibility_pay: null });
    expect(updated.success && payFieldsError(updated.data)).toBeNull();
    const plain = EmployeeCreateSchema.safeParse(base);
    expect(plain.success && payFieldsError(plain.data)).toBeNull();
  });

  it("recognises a missing responsibility_pay column", () => {
    expect(
      isMissingColumnError({ code: "42703", message: "column employees.responsibility_pay does not exist" }, "responsibility_pay"),
    ).toBe(true);
    expect(
      isMissingColumnError(
        { code: "PGRST204", message: "Could not find the 'responsibility_pay' column of 'employees' in the schema cache" },
        "responsibility_pay",
      ),
    ).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate key" }, "responsibility_pay")).toBe(false);
    expect(isMissingColumnError(null, "responsibility_pay")).toBe(false);
  });
});
