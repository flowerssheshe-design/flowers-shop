import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { moveOrderStall } from "@/lib/staff/ops/order-fix-server";
import { UUID_RE, jsonError, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({ stall_id: z.string().uuid() });

/** Moves an order to another pickup stall; its bouquets move with it. */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff(["orders", "stalls"]);
  if (!guard.ok) return guard.response;
  if (!UUID_RE.test(ctx.params.id)) return jsonError("ההזמנה לא נמצאה", 404);
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  try {
    const res = await moveOrderStall(createAdminClient(), ctx.params.id, body.data.stall_id);
    if (!res.ok) return jsonError(res.error, res.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "order stall PATCH");
  }
}
