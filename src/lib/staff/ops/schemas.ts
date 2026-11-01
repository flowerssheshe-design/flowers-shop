// Zod schemas for the operations API routes, with Hebrew messages.

import { z } from "zod";

const roleEnum = z.enum(["owner", "ops_manager", "marketing", "worker"], {
  errorMap: () => ({ message: "בחרו תפקיד" }),
});
const workTypeEnum = z.enum(["stall_seller", "courier", "supply_runner"]);
// Responsibilities, separate from work types. An empty list = a regular worker.
const responsibilities = z.array(z.enum(["owner", "ops_manager", "marketing"])).max(3);
// Pay is set on the pay page (/staff/payroll), never when creating or editing
// an employee. The fields are still read so the API can answer with a clear
// pointer (see payFieldsError) instead of silently dropping them.
const payField = z.unknown().optional();
const pin = z.string().regex(/^\d{4,8}$/, "הקוד צריך להיות 4 עד 8 ספרות.");

export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:\d{2})?$/, "שעה לא תקינה");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין");

export const EmployeeCreateSchema = z
  .object({
    full_name: z.string().trim().min(2, "כתבו שם מלא (לפחות 2 תווים)").max(80, "השם ארוך מדי"),
    phone: z.string().trim().min(9, "מספר טלפון לא תקין").max(20, "מספר טלפון לא תקין"),
    role: roleEnum.optional(),
    roles: responsibilities.optional(),
    work_types: z.array(workTypeEnum).max(3).default([]),
    pay_type: payField,
    pay_rate: payField,
    responsibility_pay: payField,
    is_active: z.boolean().default(true),
    pin,
    pin_confirm: z.string(),
  })
  .refine((v) => v.pin === v.pin_confirm, { message: "הקודים לא תואמים. הקלידו את אותו הקוד פעמיים." });

export const EmployeeUpdateSchema = z
  .object({
    full_name: z.string().trim().min(2, "כתבו שם מלא (לפחות 2 תווים)").max(80, "השם ארוך מדי").optional(),
    phone: z.string().trim().min(9, "מספר טלפון לא תקין").max(20, "מספר טלפון לא תקין").optional(),
    role: roleEnum.optional(),
    roles: responsibilities.optional(),
    work_types: z.array(workTypeEnum).max(3).optional(),
    pay_type: payField,
    pay_rate: payField,
    responsibility_pay: payField,
    is_active: z.boolean().optional(),
    pin: pin.optional(),
    pin_confirm: z.string().optional(),
    unlock: z.boolean().optional(),
  })
  .refine((v) => v.pin === undefined || v.pin === v.pin_confirm, {
    message: "הקודים לא תואמים. הקלידו את אותו הקוד פעמיים.",
  });

export const StallCreateSchema = z.object({
  name: z.string().trim().min(2, "כתבו שם לדוכן").max(60, "השם ארוך מדי"),
  location: z.string().trim().max(200).nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

export const StallUpdateSchema = z.object({
  name: z.string().trim().min(2, "כתבו שם לדוכן").max(60, "השם ארוך מדי").optional(),
  location: z.string().trim().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
  is_open: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const EquipmentCreateSchema = z.object({
  name: z.string().trim().min(1, "כתבו שם לפריט").max(60, "השם ארוך מדי"),
});

export const EquipmentUpdateSchema = z.object({
  name: z.string().trim().min(1, "כתבו שם לפריט").max(60, "השם ארוך מדי").optional(),
  is_active: z.boolean().optional(),
});

export const EquipmentReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(200),
});

export const ShiftSchema = z
  .object({
    work_date: isoDate,
    start_time: time,
    end_time: time,
    shift_type: z.enum(["stall", "courier", "supply"], { errorMap: () => ({ message: "בחרו סוג משמרת" }) }),
    stall_id: z.string().uuid().nullable().optional(),
    employee_id: z.string().uuid({ message: "בחרו עובד" }),
    notes: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => v.end_time.slice(0, 5) > v.start_time.slice(0, 5), {
    message: "שעת הסיום חייבת להיות אחרי שעת ההתחלה",
  })
  .refine((v) => v.shift_type !== "stall" || !!v.stall_id, { message: "במשמרת דוכן צריך לבחור דוכן" });

export const CourierSchema = z.object({
  week: isoDate,
  employee_id: z.string().uuid().nullable(),
});

export const CopyWeekSchema = z.object({ week: isoDate });

export const OrderActionSchema = z.object({
  action: z.enum(["approve", "complete", "cancel"]),
});

export const InventoryUpdateSchema = z.object({
  product_id: z.string().uuid(),
  live_stock_count: z.number().int().min(0, "המלאי לא יכול להיות שלילי").max(100000).optional(),
  initial_stock_count: z.number().int().min(0, "המלאי לא יכול להיות שלילי").max(100000).optional(),
});
