import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { UUID_RE, jsonError, notConfigured, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Deletes a one-off payment (also one moved from the old salary expenses). */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("payroll");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("התשלום לא נמצא", 404);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("payroll_entries").delete().eq("id", id).select("id");
    if (error) return serverError(error, "payroll entry DELETE");
    if (!data || data.length === 0) return jsonError("התשלום לא נמצא", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "payroll entry DELETE");
  }
}
