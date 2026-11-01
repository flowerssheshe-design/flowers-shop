import "server-only";
import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";

// Helpers shared by the pay page API routes (/api/staff/payroll/**).

type Admin = ReturnType<typeof createAdminClient>;

export type PayrollEmployeeRow = {
  id: string;
  full_name: string;
  role: string;
  roles?: string[] | null;
  work_types?: string[] | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
  pay_type: string | null;
  pay_rate: number | string | null;
  responsibility_pay?: number | string | null;
};

/** Newer columns (037 roles/deleted_at, 038 responsibility_pay) are dropped when missing. */
const SELECTS = [
  "id, full_name, role, roles, work_types, is_active, deleted_at, pay_type, pay_rate, responsibility_pay",
  "id, full_name, role, roles, work_types, is_active, deleted_at, pay_type, pay_rate",
  "id, full_name, role, work_types, is_active, pay_type, pay_rate",
];

export async function loadPayrollEmployees(admin: Admin, id?: string): Promise<PayrollEmployeeRow[]> {
  let lastError: { message?: string } | null = null;
  for (const columns of SELECTS) {
    let q = admin.from("employees").select(columns);
    if (id) q = q.eq("id", id);
    const { data, error } = await q;
    if (!error) return (data ?? []) as unknown as PayrollEmployeeRow[];
    lastError = error;
  }
  throw new Error(`employees: ${lastError?.message ?? "unknown error"}`);
}

const money = (msg: string) =>
  z.number({ invalid_type_error: msg }).min(0, "הסכום לא יכול להיות שלילי").max(100000, "הסכום גבוה מדי");

export const RateSchema = z
  .object({
    employee_id: z.string().uuid({ message: "בחרו עובד" }),
    pay_type: z.enum(["hourly", "per_shift"]).nullable(),
    pay_rate: money("כתבו תעריף במספרים").nullable(),
    responsibility_pay: money("כתבו סכום במספרים").nullable(),
  })
  .refine((v) => v.pay_type === null || v.pay_rate !== null, {
    message: "כתבו תעריף לאיסוף מהספק, או בחרו ״בלי תעריף״.",
  });

export const EntrySchema = z.object({
  employee_id: z.string().uuid({ message: "בחרו עובד" }),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "בחרו שבוע"),
  amount: z
    .number({ invalid_type_error: "כתבו סכום במספרים" })
    .gt(0, "הסכום צריך להיות גדול מ-0")
    .max(100000, "הסכום גבוה מדי"),
  description: z.string().trim().min(2, "כתבו על מה התשלום (לפחות 2 תווים)").max(200, "התיאור ארוך מדי"),
});
