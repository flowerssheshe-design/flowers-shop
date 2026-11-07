import { NextResponse } from "next/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/staff/owner/cron-auth";
import { runPushReminders } from "@/lib/staff/marketing/push-reminders-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends the weekly push notifications that are due. Called every hour by the
 * Netlify scheduled function (netlify/functions/push-reminders.mjs):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/push-reminders
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!SUPABASE_CONFIGURED) return NextResponse.json({ error: "not configured" }, { status: 503 });
  try {
    return NextResponse.json(await runPushReminders(createAdminClient()));
  } catch (e) {
    console.error("[cron/push-reminders]", e);
    return NextResponse.json({ error: "push reminders failed" }, { status: 500 });
  }
}
