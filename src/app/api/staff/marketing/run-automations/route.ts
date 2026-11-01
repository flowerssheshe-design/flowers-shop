import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runAutomations } from "@/lib/staff/marketing/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  // Fail closed: with no secret configured nobody can trigger a run.
  if (secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled runner (call every 15–60 minutes from a cron):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/staff/marketing/run-automations
 * Sends due automatic WhatsApp messages. Idempotent (message_log.ref).
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runAutomations(new Date());
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("run-automations error:", e);
    return NextResponse.json({ error: "run failed" }, { status: 500 });
  }
}
