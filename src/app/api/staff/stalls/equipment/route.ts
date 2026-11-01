import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { EquipmentCreateSchema, EquipmentReorderSchema } from "@/lib/staff/ops/schemas";
import { notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import type { EquipmentItem } from "@/lib/staff/ops/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLUMNS = "id, name, sort_order, is_active";

/** Add an equipment item at the end of the list. */
export async function POST(req: Request) {
  const guard = await requireStaff("stalls");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, EquipmentCreateSchema);
  if (!body.ok) return body.response;

  try {
    const admin = createAdminClient();
    const { data: last } = await admin
      .from("stall_equipment_items")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await admin
      .from("stall_equipment_items")
      .insert({ name: body.data.name, sort_order: (Number(last?.sort_order) || 0) + 1 })
      .select(COLUMNS)
      .single();
    if (error) return serverError(error, "equipment POST");
    return NextResponse.json({ item: data as EquipmentItem });
  } catch (e) {
    return serverError(e, "equipment POST");
  }
}

/** Reorder: body { order: [id, id, ...] } → sort_order 1..n. */
export async function PUT(req: Request) {
  const guard = await requireStaff("stalls");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, EquipmentReorderSchema);
  if (!body.ok) return body.response;

  try {
    const admin = createAdminClient();
    const results = await Promise.all(
      body.data.order.map((id, i) =>
        admin.from("stall_equipment_items").update({ sort_order: i + 1 }).eq("id", id),
      ),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) return serverError(err, "equipment PUT");
    const { data, error } = await admin.from("stall_equipment_items").select(COLUMNS).order("sort_order").order("name");
    if (error) return serverError(error, "equipment PUT reload");
    return NextResponse.json({ equipment: (data ?? []) as EquipmentItem[] });
  } catch (e) {
    return serverError(e, "equipment PUT");
  }
}
