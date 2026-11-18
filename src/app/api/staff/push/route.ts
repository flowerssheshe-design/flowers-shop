import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { jsonError, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const B64URL = /^[A-Za-z0-9_-]+=*$/;

const Subscribe = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((u) => u.startsWith("https://"), "invalid endpoint"),
  keys: z.object({
    p256dh: z.string().min(20).max(200).regex(B64URL),
    auth: z.string().min(8).max(100).regex(B64URL),
  }),
});

const Unsubscribe = z.object({ endpoint: z.string().url().max(1000) });

/** This phone gets the stall's "new order" notifications for the signed-in employee. */
export async function POST(req: Request) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, Subscribe);
  if (!body.ok) return body.response;
  try {
    const { error } = await createAdminClient()
      .from("staff_push_subscriptions")
      .upsert(
        {
          employee_id: guard.session.employee.id,
          endpoint: body.data.endpoint,
          p256dh: body.data.keys.p256dh,
          auth: body.data.keys.auth,
        },
        { onConflict: "endpoint" },
      );
    if (error && /staff_push_subscriptions/.test(error.message)) return jsonError("צריך להריץ את מיגרציה 051 כדי להפעיל התראות לעובדים.", 503);
    if (error) return serverError(error, "staff push subscribe");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "staff push subscribe");
  }
}

/** Stops the notifications on this phone. */
export async function DELETE(req: Request) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, Unsubscribe);
  if (!body.ok) return body.response;
  await createAdminClient()
    .from("staff_push_subscriptions")
    .delete()
    .eq("endpoint", body.data.endpoint)
    .eq("employee_id", guard.session.employee.id);
  return NextResponse.json({ ok: true });
}
