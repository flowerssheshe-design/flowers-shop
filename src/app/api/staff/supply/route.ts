import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/guard";
import { preorderTotals } from "@/lib/staff/work/forecast";
import { canDecideDistribution, totalsByStall } from "@/lib/staff/work/distribution";
import { weekOrdersRange } from "@/lib/staff/work/ranges";
import { addDays } from "@/lib/staff/week";
import { jsonError, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Supplier pickup list for the current week (the real supplier order lines,
 * or a forecast from pre-orders when there are none yet), plus what the
 * morning distribution needs: stalls, who works there today, general stock
 * and what was already distributed today.
 */
export async function GET() {
  const guard = await requireStaff("supply");
  if (!guard.ok) return guard.response;

  try {
    const { admin, settings, week } = await workContext();
    const range = weekOrdersRange(week, settings);
    // The stalls work on Friday only.
    const friday = addDays(week.weekStart, 5);

    const [linesRes, productsRes, invRes, stallsRes, shiftsRes, distRes] = await Promise.all([
      admin
        .from("supplier_order_lines")
        .select("product_id, final_qty, picked_up")
        .eq("week_start", week.weekStart),
      admin
        .from("products")
        .select("id, title, image_url, sort_order, is_active")
        .order("sort_order", { ascending: true }),
      admin.from("inventory").select("product_id, live_stock_count"),
      admin
        .from("stalls")
        .select("id, name, location, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("shifts")
        .select("stall_id, start_time, end_time, employees!shifts_employee_id_fkey(full_name)")
        .eq("work_date", friday)
        .eq("shift_type", "stall")
        .order("start_time", { ascending: true }),
      // What each stall gets on Friday = its stall stock (split on the stock page).
      admin.from("stall_inventory").select("stall_id, product_id, stock").gt("stock", 0),
    ]);
    const firstError = [linesRes, productsRes, invRes, stallsRes, shiftsRes, distRes].find((r) => r.error);
    if (firstError) {
      console.error("staff/supply GET:", firstError.error);
      return jsonError("לא הצלחנו לטעון את נתוני האיסוף. נסו לרענן.", 500);
    }

    const allProducts = productsRes.data ?? [];
    const titles = new Map(allProducts.map((p) => [String(p.id), String(p.title)]));
    const stockBy = new Map((invRes.data ?? []).map((r) => [String(r.product_id), Number(r.live_stock_count) || 0]));

    let source: "supplier" | "forecast" = "supplier";
    let lines = (linesRes.data ?? [])
      .filter((l) => Number(l.final_qty) > 0)
      .map((l) => ({
        product_id: String(l.product_id),
        title: titles.get(String(l.product_id)) ?? "",
        qty: Number(l.final_qty) || 0,
        picked_up: l.picked_up === true,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "he"));

    if ((linesRes.data ?? []).length === 0) {
      source = "forecast";
      const { data: preorders, error } = await admin
        .from("orders")
        .select("status, items")
        .eq("order_type", "preorder")
        .gte("created_at", range.from)
        .lt("created_at", range.to);
      if (error) return jsonError("לא הצלחנו לחשב את הצפי מההזמנות", 500);
      lines = preorderTotals(preorders ?? [], titles).map((l) => ({ ...l, picked_up: false }));
    }

    const scheduled: Record<string, { name: string; start_time: string; end_time: string }[]> = {};
    for (const s of (shiftsRes.data ?? []) as unknown as {
      stall_id: string | null;
      start_time: string;
      end_time: string;
      employees: { full_name: string } | null;
    }[]) {
      if (!s.stall_id) continue;
      (scheduled[s.stall_id] ??= []).push({
        name: s.employees?.full_name ?? "",
        start_time: s.start_time.slice(0, 5),
        end_time: s.end_time.slice(0, 5),
      });
    }

    return NextResponse.json({

      // Managers save the distribution; everybody else gets a read-only view.
      // The split is set on the stock page; here everyone sees it. Managers get a link there.
      canDistribute: false,
      canManage: canDecideDistribution(guard.session.employee),
      friday,
      week: { start: week.weekStart, end: week.weekEnd, phase: week.phase },
      source,
      lines,
      products: allProducts
        .filter((p) => p.is_active)
        .map((p) => ({
          id: String(p.id),
          title: String(p.title),
          image_url: (p.image_url as string | null) ?? null,
          stock: stockBy.has(String(p.id)) ? stockBy.get(String(p.id))! : null,
        })),
      stalls: (stallsRes.data ?? []).map((s) => ({ id: String(s.id), name: String(s.name), location: s.location ?? null })),
      scheduled,
      distributedToday: totalsByStall(
        (distRes.data ?? []).map((d) => ({
          stall_id: String(d.stall_id),
          product_id: String(d.product_id),
          qty: Number(d.stock) || 0,
        })),
      ),
    });
  } catch (e) {
    console.error("staff/supply GET failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
