import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { ReminderSchema } from "@/lib/staff/marketing/push-reminders";
import { REMINDERS_KEY, loadReminders } from "@/lib/staff/marketing/push-reminders-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The weekly automatic notifications (Tuesday / Thursday) and when each last went out. */
export async function GET() {
  const guard = await requireStaff("marketing_push");
  if (!guard.ok) return guard.response;
  try {
    const { config, sent } = await loadReminders(createAdminClient());
    return NextResponse.json({ config, sent });
  } catch (e) {
    console.error("push reminders GET:", e);
    return NextResponse.json({ error: "הטעינה נכשלה. נסו לרענן." }, { status: 500 });
  }
}

const Body = z.object({ tuesday: ReminderSchema, thursday: ReminderSchema });

export async function PUT(req: Request) {
  const guard = await requireStaff("marketing_push");
  if (!guard.ok) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" }, { status: 400 });
  }
  try {
    const { error } = await createAdminClient()
      .from("system_settings")
      .upsert({ key: REMINDERS_KEY, value: parsed.data, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return NextResponse.json({ config: parsed.data });
  } catch (e) {
    console.error("push reminders PUT:", e);
    return NextResponse.json({ error: "השמירה נכשלה. נסו שוב." }, { status: 500 });
  }
}
