import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/guard";
import { isStallSaleOrder } from "@/lib/utils";
import { dayRange, weekOrdersRange } from "@/lib/staff/work/ranges";
import { summarizeSales } from "@/lib/staff/work/sales";
import { isStallManager } from "@/lib/staff/work/stall-access";
import { jsonError, stallAccess, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Everything the stall screen needs for one stall, polled every ~20s:
 * stock, today's sales and summary, write-offs, equipment checklists,
 * pickup orders to hand over, and the Bit details.
 */
export async function GET(req: Request) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;

  try {
    const { admin, settings, week, today } = await workContext();
    const { stalls, defaultId } = await stallAccess(admin, me, today);
    const requested = new URL(req.url).searchParams.get("stall_id");
    const stall = stalls.find((s) => s.id === requested) ?? stalls.find((s) => s.id === defaultId) ?? null;

    const base = {
      today,
      canChooseStall: isStallManager(me),
      stalls: stalls.map((s) => ({ id: s.id, name: s.name, location: s.location ?? null })),
      bit: { number: settings.stall_bit_number ?? "", qr_url: settings.stall_bit_qr_url ?? "" },
    };
    if (!stall) return NextResponse.json({ ...base, stall: null });

    const day = dayRange(today);
    const weekRange = weekOrdersRange(week, settings);

    const [productsRes, stockRes, salesRes, writeoffsRes, equipRes, checklistRes, pickupRes] =
      await Promise.all([
        admin
          .from("products")
          .select("id, title, image_url, price_standard, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        admin.from("stall_inventory").select("product_id, stock, initial_stock").eq("stall_id", stall.id),
        admin
          .from("orders")
          .select("id, created_at, items, total_amount, payment_method, status, sold_by")
          .eq("order_type", "stall")
          .eq("stall_id", stall.id)
          .gte("created_at", day.from)
          .lt("created_at", day.to)
          .order("created_at", { ascending: false }),
        admin
          .from("stall_writeoffs")
          .select("id, product_id, qty, reason, created_at")
          .eq("stall_id", stall.id)
          .eq("work_date", today)
          .order("created_at", { ascending: false }),
        admin
          .from("stall_equipment_items")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        admin
          .from("stall_checklists")
          .select("kind, checked_item_ids, notes, created_at")
          .eq("stall_id", stall.id)
          .eq("work_date", today),
        admin
          .from("orders")
          .select(
            "id, created_at, customer_name, customer_phone, items, total_amount, payment_method, notes, greeting_note, order_type",
          )
          .eq("status", "approved")
          .eq("delivery_type", "pickup")
          .neq("order_type", "stall")
          .gte("created_at", weekRange.from)
          .lt("created_at", weekRange.to)
          .order("created_at", { ascending: true }),
      ]);

    const firstError = [productsRes, stockRes, salesRes, writeoffsRes, equipRes, checklistRes, pickupRes].find(
      (r) => r.error,
    );
    if (firstError) {
      console.error("staff/stall GET:", firstError.error);
      return jsonError("לא הצלחנו לטעון את נתוני הדוכן. נסו לרענן.", 500);
    }

    const stockBy = new Map<string, { stock: number; initial_stock: number }>();
    for (const r of stockRes.data ?? []) {
      stockBy.set(String(r.product_id), { stock: Number(r.stock) || 0, initial_stock: Number(r.initial_stock) || 0 });
    }
    const products = (productsRes.data ?? []).map((p) => ({
      id: String(p.id),
      title: String(p.title),
      image_url: (p.image_url as string | null) ?? null,
      price_standard: Number(p.price_standard) || 0,
      stock: stockBy.get(String(p.id))?.stock ?? 0,
      initial_stock: stockBy.get(String(p.id))?.initial_stock ?? 0,
    }));
    const titleOf = new Map(products.map((p) => [p.id, p.title]));

    const sales = salesRes.data ?? [];
    const checklists = { open: null as unknown, close: null as unknown };
    for (const c of checklistRes.data ?? []) {
      if (c.kind === "open" || c.kind === "close") checklists[c.kind as "open" | "close"] = c;
    }

    return NextResponse.json({
      ...base,
      stall: { id: stall.id, name: stall.name, location: stall.location ?? null, is_open: Boolean(stall.is_open) },
      products,
      sales,
      summary: summarizeSales(sales),
      writeoffs: (writeoffsRes.data ?? []).map((w) => ({
        ...w,
        title: titleOf.get(String(w.product_id)) ?? "",
      })),
      equipment: equipRes.data ?? [],
      checklists,
      pickupOrders: (pickupRes.data ?? []).filter((o) => !isStallSaleOrder(o)),
    });
  } catch (e) {
    console.error("staff/stall GET failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
