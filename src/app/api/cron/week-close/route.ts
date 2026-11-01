import { NextResponse } from "next/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { runWeekClose } from "@/lib/staff/owner/week-close-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoMarkSupplierOrderIfDue } from "@/lib/staff/owner/supplier-server";
import { isAuthorizedCron } from "@/lib/staff/owner/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Closes any past business week that is still open. Idempotent: running it
 * twice (or alongside the dashboard) closes each week once.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/week-close
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  try {
    const result = await runWeekClose();
    await autoMarkSupplierOrderIfDue(createAdminClient());
    return NextResponse.json(result, { status: result.errors.length ? 500 : 200 });
  } catch (e) {
    console.error("[cron/week-close]", e);
    return NextResponse.json({ error: "week close failed" }, { status: 500 });
  }
}
