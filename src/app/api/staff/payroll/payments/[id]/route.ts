import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { UUID_RE, jsonError, notConfigured, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Undo a "שולם" that was recorded by mistake. */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("payroll");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  if (!UUID_RE.test(ctx.params.id)) return jsonError("התשלום לא נמצא", 404);
  try {
    const { data, error } = await createAdminClient().from("payroll_payments").delete().eq("id", ctx.params.id).select("id");
    if (error) return serverError(error, "payment DELETE");
    if (!data || data.length === 0) return jsonError("התשלום לא נמצא", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "payment DELETE");
  }
}
