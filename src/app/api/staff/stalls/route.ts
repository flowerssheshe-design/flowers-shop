import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { israelDate } from "@/lib/staff/week";
import { StallCreateSchema } from "@/lib/staff/ops/schemas";
import { hhmm } from "@/lib/staff/ops/schedule";
import { notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import type { EquipmentItem, Stall, StallWithToday } from "@/lib/staff/ops/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STALL_COLUMNS = "id, name, location, is_active, is_open, sort_order";

/** All stalls with today's stock and who is scheduled there today, plus the equipment list. */
export async function GET() {
  const guard = await requireStaff("stalls");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  try {
    const admin = createAdminClient();
    const today = israelDate();
    const [stallsRes, stockRes, shiftsRes, equipmentRes] = await Promise.all([
      admin.from("stalls").select(STALL_COLUMNS).order("sort_order").order("name"),
      admin.from("stall_inventory").select("stall_id, product_id, stock, initial_stock"),
      admin
        .from("shifts")
        .select("stall_id, employee_id, start_time, end_time")
        .eq("work_date", today)
        .eq("shift_type", "stall")
        .order("start_time"),
      admin.from("stall_equipment_items").select("id, name, sort_order, is_active").order("sort_order").order("name"),
    ]);
    const err = stallsRes.error ?? stockRes.error ?? shiftsRes.error ?? equipmentRes.error;
    if (err) return serverError(err, "stalls GET");

    const stock = stockRes.data ?? [];
    const shifts = shiftsRes.data ?? [];
    const productIds = Array.from(new Set(stock.map((s) => String(s.product_id))));
    const employeeIds = Array.from(new Set(shifts.map((s) => String(s.employee_id))));
    const [productsRes, employeesRes] = await Promise.all([
      productIds.length
        ? admin.from("products").select("id, title").in("id", productIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
      employeeIds.length
        ? admin.from("employees").select("id, full_name").in("id", employeeIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
    ]);
    const titles = new Map((productsRes.data ?? []).map((p) => [String(p.id), String(p.title)]));
    const names = new Map((employeesRes.data ?? []).map((e) => [String(e.id), String(e.full_name)]));

    const stalls: StallWithToday[] = ((stallsRes.data ?? []) as Stall[]).map((s) => ({
      ...s,
      stock: stock
        .filter((r) => r.stall_id === s.id && (Number(r.stock) > 0 || Number(r.initial_stock) > 0))
        .map((r) => ({
          product_id: String(r.product_id),
          title: titles.get(String(r.product_id)) ?? "מוצר שנמחק",
          stock: Number(r.stock) || 0,
          initial_stock: Number(r.initial_stock) || 0,
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "he")),
      scheduled: shifts
        .filter((sh) => sh.stall_id === s.id)
        .map((sh) => ({
          employee_id: String(sh.employee_id),
          full_name: names.get(String(sh.employee_id)) ?? "",
          start_time: hhmm(sh.start_time),
          end_time: hhmm(sh.end_time),
        })),
    }));

    return NextResponse.json({
      today,
      stalls,
      equipment: (equipmentRes.data ?? []) as EquipmentItem[],
    });
  } catch (e) {
    return serverError(e, "stalls GET");
  }
}

export async function POST(req: Request) {
  const guard = await requireStaff("stalls");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, StallCreateSchema);
  if (!body.ok) return body.response;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("stalls")
      .insert({ ...body.data, location: body.data.location || null })
      .select(STALL_COLUMNS)
      .single();
    if (error) return serverError(error, "stalls POST");
    return NextResponse.json({ stall: data as Stall });
  } catch (e) {
    return serverError(e, "stalls POST");
  }
}
