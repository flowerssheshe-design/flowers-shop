// Validation for the owner settings page (/api/staff/settings).
import { z } from "zod";

const time = z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "שעה בפורמט HH:MM, למשל 12:00");
const optionalTime = z.union([time, z.literal("")]);
const text = (max: number) => z.string().trim().max(max);
const day = z.number().int().min(0).max(6);

export const SettingsSchema = z
  .object({
    // money and discounts
    delivery_fee: z.number().min(0).max(1000),
    member_discount_percent: z.number().min(0).max(100),
    club_discount_threshold: z.number().int().min(0).max(1000),
    // week and supplier order
    supplier_order_day: day,
    supplier_order_time: time,
    week_close_day: day,
    week_close_time: time,
    preorder_deadline: optionalTime,
    same_day_deadline: optionalTime,
    // stalls
    stall_hours: text(200),
    money_start_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"), z.literal("")]),
    stall_bit_number: text(40),
    stall_bit_qr_url: z.union([z.string().trim().url().max(1000), z.literal("")]),
    is_stall_open: z.boolean(),
    // pickup and delivery
    pickup_address: text(300),
    pickup_instructions: text(1000),
    pickup_hours: text(200),
    business_hours: text(300),
    // contact and payment
    business_phone: text(30),
    contact_phone: text(30),
    whatsapp_number: text(30),
    business_email: z.union([z.string().trim().email().max(200), z.literal("")]),
    bit_number: text(40),
    paybox_number: text(40),
    // banner
    announcement_banner_text: text(500),
  })
  .partial()
  .strict();

export type SettingsInput = z.infer<typeof SettingsSchema>;

export const SettingsPostSchema = z.object({
  settings: SettingsSchema.optional(),
  store_mode: z.enum(["auto", "preorder", "realtime"]).optional(),
});

/** The week must close after the supplier order (both counted from Sunday). */
export function weekTimesValid(s: {
  supplier_order_day: number;
  supplier_order_time: string;
  week_close_day: number;
  week_close_time: string;
}): boolean {
  const m = (t: string) => {
    const [h, mm] = t.split(":").map(Number);
    return h * 60 + mm;
  };
  return s.week_close_day * 1440 + m(s.week_close_time) > s.supplier_order_day * 1440 + m(s.supplier_order_time);
}
