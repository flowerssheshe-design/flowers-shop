import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { Order, TopProduct, WeeklyArchive } from "@/types";
import { expensesForWeek, type ExpenseBucket, type WeeklyExpenseBreakdown } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Recompute the aggregate financial fields of a stored archive from its
 * already-correct per-segment values (preorders_* / stall_*) plus the week's
 * recorded expenses. This guarantees the displayed figures are always
 * consistent regardless of how/when the archive was originally written:
 *   - gross_profit = preorders_profit + stall_profit
 *     (= total_revenue - total_cost, where cost is only for *sold* items)
 *   - total_cost / total_supplier_cost = sum of cost prices of sold items
 *   - stall_sales_count = units sold at the stall (inventory-derived)
 *   - total_net_profit = gross_profit - expenses for the archived week
 *     (fixed/recurring costs apply to every week from their creation week on,
 *      one-time costs only to their own week - see lib/expenses.ts)
 */
function recomputeArchive(
  arc: WeeklyArchive,
  weekExpenses: number,
  breakdown?: WeeklyExpenseBreakdown,
): WeeklyArchive {
  const preRev = Number(arc.preorders_revenue || 0);
  const preProf = Number(arc.preorders_profit || 0);
  const preCost = preRev - preProf;

  const stallRev = Number(arc.stall_revenue || 0);
  const stallProf = Number(arc.stall_profit || 0);
  const stallCost = stallRev - stallProf;

  const totalCost = preCost + stallCost;
  const grossProfit = preProf + stallProf;

  // Stall sales are inventory-tracked (units_sold = initial - live).
  // Prefer the snapshot's inventory totals; fall back to the stored column.
  let stallSalesCount: number = Number(arc.stall_sales_count || 0);
  try {
    const snap = (arc.snapshot_data ?? {}) as Record<string, unknown>;
    const inv = (snap?.stall_inventory ?? {}) as Record<string, unknown> | undefined;
    const totals = (inv?.totals ?? {}) as { units_sold?: number | string } | undefined;
    const units = Number(totals?.units_sold ?? 0);
    if (!Number.isNaN(units) && units >= 0) {
      stallSalesCount = units;
    }
  } catch {
    // keep fallback
  }

  return {
    ...arc,
    total_revenue: preRev + stallRev,
    total_cost: totalCost,
    gross_profit: grossProfit,
    total_supplier_cost: totalCost,
    stall_sales_count: stallSalesCount,
    total_expenses: weekExpenses,
    recurring_expenses: breakdown?.recurring ?? weekExpenses,
    one_time_expenses: breakdown?.oneTime ?? 0,
    total_net_profit: grossProfit - weekExpenses,
  } as WeeklyArchive;
}

export async function GET(req: Request) {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ archives: [], orders: [] });
  }
  const url = new URL(req.url);
  const archiveId = url.searchParams.get("id");
  const admin = createAdminClient();

  try {
    const { data: archives, error: aErr } = await admin
      .from("weekly_archives")
      .select("*")
      .order("week_start", { ascending: false });
    if (aErr) {
      return NextResponse.json({ error: "טעינת היסטוריה נכשלה" }, { status: 500 });
    }

    const rawArchives = (archives as WeeklyArchive[] | null) ?? [];

    // Bucket expenses per archive week. One-time expenses only land in the
    // week they were recorded in; fixed/recurring expenses are charged to
    // every week from their creation week onward.
    const { data: expenseRows } = await admin
      .from("expenses")
      .select("amount, expense_type, expense_date, creation_date, created_at, is_active")
      .order("created_at", { ascending: true });
    const expenses = (expenseRows ?? []) as ExpenseBucket[];

    const enriched = rawArchives.map((a) => {
      const weekExpenses = expensesForWeek(
        expenses,
        a.week_start,
        a.week_end,
      );
      return recomputeArchive(a, weekExpenses.total, weekExpenses);
    });

    let orders: Order[] = [];
    let selectedTopProducts: TopProduct[] = [];
    if (archiveId) {
      const archive = enriched.find(
        (a) => a.id === archiveId,
      );
      if (archive) {
        const { data: ord } = await admin
          .from("orders")
          .select("*")
          .gte("created_at", archive.week_start)
          .lt("created_at", archive.week_end)
          .order("created_at", { ascending: false });
        orders = (ord as Order[]) ?? [];
        selectedTopProducts =
          (archive.top_products as TopProduct[]) ?? [];
      }
    }

    return NextResponse.json({
      archives: enriched,
      orders,
      topProducts: archiveId
        ? selectedTopProducts
        : ((enriched?.[0]?.top_products as TopProduct[] | undefined) ?? []),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
