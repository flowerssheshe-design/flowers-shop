import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerSettings, type ServerSettings } from "@/lib/settings-server";
import { currentBusinessWeek, israelDate, type BusinessWeek } from "@/lib/staff/week";
import type { StaffEmployee } from "@/lib/staff/session";
import {
  allowedStalls,
  defaultStallId,
  type StallRow,
  type TodayShiftRow,
} from "@/lib/staff/work/stall-access";

export type Admin = ReturnType<typeof createAdminClient>;

export type WorkContext = {
  admin: Admin;
  settings: ServerSettings;
  week: BusinessWeek;
  today: string;
  now: Date;
};

export async function workContext(): Promise<WorkContext> {
  const settings = await getServerSettings();
  const now = new Date();
  return {
    admin: createAdminClient(),
    settings,
    week: currentBusinessWeek(settings, now),
    today: israelDate(now),
    now,
  };
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: jsonError("הנתונים שנשלחו לא תקינים. רעננו את הדף ונסו שוב.") };
  }
  return { ok: true, data: parsed.data };
}

/** Stalls this person may work at today, and the one to open first. */
export async function stallAccess(
  admin: Admin,
  me: StaffEmployee,
  today: string,
): Promise<{ stalls: StallRow[]; defaultId: string | null }> {
  const [{ data: stalls, error: stallsErr }, { data: shifts, error: shiftsErr }] = await Promise.all([
    admin
      .from("stalls")
      .select("id, name, location, is_active, is_open, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("shifts")
      .select("stall_id, shift_type, start_time")
      .eq("employee_id", me.id)
      .eq("work_date", today)
      .eq("shift_type", "stall"),
  ]);
  if (stallsErr) throw stallsErr;
  if (shiftsErr) throw shiftsErr;
  const myShifts = (shifts ?? []) as TodayShiftRow[];
  const allowed = allowedStalls(me, (stalls ?? []) as StallRow[], myShifts);
  return { stalls: allowed, defaultId: defaultStallId(allowed, myShifts) };
}

/** The stall if this person may work at it today, else null. */
export async function checkStall(
  admin: Admin,
  me: StaffEmployee,
  today: string,
  stallId: string,
): Promise<StallRow | null> {
  const { stalls } = await stallAccess(admin, me, today);
  return stalls.find((s) => s.id === stallId) ?? null;
}

/** Atomic change of a stall's stock. Returns the new stock, or null when it would go negative. */
export async function stallAdjust(
  admin: Admin,
  stallId: string,
  productId: string,
  delta: number,
): Promise<number | null> {
  const { data, error } = await admin.rpc("stall_stock_adjust", {
    p_stall: stallId,
    p_product: productId,
    p_delta: delta,
  });
  if (error) throw error;
  return data === null || data === undefined ? null : Number(data);
}

export const NO_STALL_ACCESS = "אין לך משמרת בדוכן הזה היום";
