import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { StallUpdateSchema } from "@/lib/staff/ops/schemas";
import { UUID_RE, jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import type { Stall } from "@/lib/staff/ops/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STALL_COLUMNS = "id, name, location, is_active, is_open, sort_order";

/** Edit a stall or flip "open now". */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("stalls");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("הדוכן לא נמצא", 404);
  const body = await parseBody(req, StallUpdateSchema);
  if (!body.ok) return body.response;

  const update: Record<string, unknown> = { ...body.data };
  if ("location" in update) update.location = body.data.location || null;
  // An inactive stall can't stay open.
  if (body.data.is_active === false) update.is_open = false;
  if (Object.keys(update).length === 0) return jsonError("לא נשלח שום שינוי", 400);

  try {
    const admin = createAdminClient();
    if (body.data.is_open === true) {
      const { data: cur } = await admin.from("stalls").select("is_active").eq("id", id).maybeSingle();
      if (cur && cur.is_active === false) return jsonError("אי אפשר לפתוח דוכן לא פעיל. הפכו אותו לפעיל קודם.", 409);
    }
    const { data, error } = await admin.from("stalls").update(update).eq("id", id).select(STALL_COLUMNS).maybeSingle();
    if (error) return serverError(error, "stall PATCH");
    if (!data) return jsonError("הדוכן לא נמצא", 404);
    return NextResponse.json({ stall: data as Stall });
  } catch (e) {
    return serverError(e, "stall PATCH");
  }
}

/** Delete a stall that was never used. Used stalls are deactivated instead, so history stays intact. */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("stalls");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("הדוכן לא נמצא", 404);

  try {
    const admin = createAdminClient();
    const [shifts, orders, checklists] = await Promise.all([
      admin.from("shifts").select("id", { count: "exact", head: true }).eq("stall_id", id),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("stall_id", id),
      admin.from("stall_checklists").select("id", { count: "exact", head: true }).eq("stall_id", id),
    ]);
    const err = shifts.error ?? orders.error ?? checklists.error;
    if (err) return serverError(err, "stall DELETE count");
    if ((shifts.count ?? 0) + (orders.count ?? 0) + (checklists.count ?? 0) > 0) {
      return jsonError("לדוכן הזה יש משמרות או מכירות, ולכן אי אפשר למחוק אותו. אפשר להפוך אותו ללא פעיל.", 409);
    }
    const { error } = await admin.from("stalls").delete().eq("id", id);
    if (error) return serverError(error, "stall DELETE");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "stall DELETE");
  }
}
