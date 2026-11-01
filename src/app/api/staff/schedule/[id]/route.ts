import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { ShiftSchema } from "@/lib/staff/ops/schemas";
import { SHIFT_COLUMNS, overlapWarnings, toShift, validateShiftRefs } from "@/lib/staff/ops/shift-server";
import { UUID_RE, jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Replace a shift's details (the client sends the whole shift). */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("schedule");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("המשמרת לא נמצאה", 404);
  const body = await parseBody(req, ShiftSchema);
  if (!body.ok) return body.response;
  const v = body.data;
  const stall_id = v.shift_type === "stall" ? v.stall_id ?? null : null;

  try {
    const admin = createAdminClient();
    const refError = await validateShiftRefs(admin, { shift_type: v.shift_type, employee_id: v.employee_id, stall_id });
    if (refError) return jsonError(refError, 400);

    const { data, error } = await admin
      .from("shifts")
      .update({
        work_date: v.work_date,
        start_time: v.start_time,
        end_time: v.end_time,
        shift_type: v.shift_type,
        stall_id,
        employee_id: v.employee_id,
        notes: v.notes || null,
      })
      .eq("id", id)
      .select(SHIFT_COLUMNS)
      .maybeSingle();
    if (error) return serverError(error, "shift PATCH");
    if (!data) return jsonError("המשמרת לא נמצאה", 404);
    const shift = toShift(data as Record<string, unknown>);
    const warnings = await overlapWarnings(admin, shift);
    return NextResponse.json({ shift, warnings });
  } catch (e) {
    return serverError(e, "shift PATCH");
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("schedule");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("המשמרת לא נמצאה", 404);

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("shifts").delete().eq("id", id);
    if (error) return serverError(error, "shift DELETE");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "shift DELETE");
  }
}
