import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { markRefunded } from "@/lib/staff/ops/order-fix-server";
import { UUID_RE, jsonError, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The money of a cancelled paid order was sent back by hand. */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff(["orders", "stalls"]);
  if (!guard.ok) return guard.response;
  if (!UUID_RE.test(ctx.params.id)) return jsonError("ההזמנה לא נמצאה", 404);
  try {
    const res = await markRefunded(createAdminClient(), ctx.params.id);
    if (!res.ok) return jsonError(res.error, res.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "order refund POST");
  }
}
