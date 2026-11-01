import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession } from "@/lib/staff/session";
import { hashPin, verifyPin } from "@/lib/staff/pin";
import {
  PIN_LOCKED_ERROR,
  PIN_WRONG_ERROR,
  checkPinChangeInput,
  failedPinUpdate,
  isPinLocked,
} from "@/lib/staff/work/pin-change";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  current_pin: z.string().max(20),
  new_pin: z.string().max(20),
  new_pin_confirm: z.string().max(20),
});

/**
 * Any logged-in staff member changes their own PIN. The current PIN is
 * checked with the same lockout as the login (5 wrong → 15 minutes).
 */
export async function POST(req: Request) {
  // Any active staff session (owners too), not only the "me" section.
  const session = await getStaffSession();
  if (!session) return jsonError("נדרשת התחברות עובד", 401);
  const meId = session.employee.id;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("הנתונים שנשלחו לא תקינים", 400);
  const input = {
    current_pin: parsed.data.current_pin.trim(),
    new_pin: parsed.data.new_pin.trim(),
    new_pin_confirm: parsed.data.new_pin_confirm.trim(),
  };
  const invalid = checkPinChangeInput(input);
  if (invalid) return jsonError(invalid, 400);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("employees")
      .select("id, pin_hash, failed_pin_attempts, locked_until")
      .eq("id", meId)
      .maybeSingle();
    if (error || !data) return jsonError("לא הצלחנו לטעון את הפרטים שלך", 500);
    const emp = data as { id: string; pin_hash: string | null; failed_pin_attempts: number | null; locked_until: string | null };

    const now = new Date();
    if (isPinLocked(emp.locked_until, now)) return jsonError(PIN_LOCKED_ERROR, 429);

    const ok = await verifyPin(input.current_pin, emp.pin_hash);
    if (!ok) {
      const { locked, update } = failedPinUpdate(emp.failed_pin_attempts, now);
      const { error: updErr } = await admin.from("employees").update(update).eq("id", emp.id);
      if (updErr) console.error("staff pin change attempt update failed:", updErr);
      return locked ? jsonError(PIN_LOCKED_ERROR, 429) : jsonError(PIN_WRONG_ERROR, 400);
    }

    const pin_hash = await hashPin(input.new_pin);
    const { error: updErr } = await admin
      .from("employees")
      .update({ pin_hash, failed_pin_attempts: 0, locked_until: null })
      .eq("id", emp.id);
    if (updErr) {
      console.error("staff pin change failed:", updErr);
      return jsonError("לא הצלחנו לשמור את הקוד החדש. נסו שוב.", 500);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("staff/me/pin failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
