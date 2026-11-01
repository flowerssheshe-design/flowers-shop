import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { EquipmentUpdateSchema } from "@/lib/staff/ops/schemas";
import { UUID_RE, jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import type { EquipmentItem } from "@/lib/staff/ops/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Rename or (de)activate an equipment item. Items are never deleted, old checklists point at them. */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("stalls");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("הפריט לא נמצא", 404);
  const body = await parseBody(req, EquipmentUpdateSchema);
  if (!body.ok) return body.response;
  if (Object.keys(body.data).length === 0) return jsonError("לא נשלח שום שינוי", 400);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("stall_equipment_items")
      .update(body.data)
      .eq("id", id)
      .select("id, name, sort_order, is_active")
      .maybeSingle();
    if (error) return serverError(error, "equipment PATCH");
    if (!data) return jsonError("הפריט לא נמצא", 404);
    return NextResponse.json({ item: data as EquipmentItem });
  } catch (e) {
    return serverError(e, "equipment PATCH");
  }
}
