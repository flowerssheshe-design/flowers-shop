import { NextResponse } from "next/server";
import { exclusionKey } from "@/lib/staff/owner/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { laterDate, moneyStartDate } from "@/lib/staff/money-start";
import { currentBusinessWeek } from "@/lib/staff/week";
import { weekWindow } from "@/lib/staff/owner/week-math";
import { buildMoneyOverview, moneyWeekList, weeksSince } from "@/lib/staff/owner/money";
import {
  loadBudgets,
  carryBudgetForward,
  loadBusinessWeeks,
  loadEmployees,
  loadExpenses,
  loadOrders,
  loadPayContext,
  loadPayrollWeeks,
  loadProducts,
  loadShifts,
  loadSupplierLines,
} from "@/lib/staff/owner/data";
import { notConfigured, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The money overview ("כסף"): where the money is (Bit / cash / PayBox), this
 * week, this month, since the start, best sellers, and the last weeks one row
 * each. ?weeks=4..26 is how many recent weeks to list (default 12); the totals
 * always cover every week since the first order.
 */
export async function GET(req: Request) {
  const guard = await requireStaff("money");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  const param = Number(new URL(req.url).searchParams.get("weeks") ?? 12);
  const recent = Number.isInteger(param) ? Math.min(26, Math.max(1, param)) : 12;

  try {
    const now = new Date();
    const admin = createAdminClient();
    const settings = await getServerSettings();
    const current = currentBusinessWeek(settings, now);
    await carryBudgetForward(admin, current.weekStart);

    // The business started with its first order.
    const firstRes = await admin.from("orders").select("created_at").order("created_at", { ascending: true }).limit(1);
    if (firstRes.error) throw new Error(`orders: ${firstRes.error.message}`);
    const since = (firstRes.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
    const firstOrderDate = since ? new Date(since).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) : null;
    // "סופרים כסף מתאריך" (settings): count only from there; orders are never deleted.
    const startDate = moneyStartDate(settings);
    const sinceDate = laterDate(firstOrderDate, startDate);
    const sinceWeeks = weeksSince(sinceDate, current, settings);
    const weeks = startDate ? sinceWeeks : Math.max(recent, sinceWeeks);

    const list = moneyWeekList(current, settings, weeks, now);
    const oldest = list[list.length - 1];
    const from = weekWindow(oldest, settings).from;
    const to = weekWindow(current, settings).to;
    const starts = list.map((w) => w.weekStart);

    const [orders, products, expenses, employees, shifts, snapshots, businessWeeks, supplierLines, budgets, ctx] = await Promise.all([
      loadOrders(admin, from, to),
      loadProducts(admin),
      loadExpenses(admin),
      loadEmployees(admin),
      loadShifts(admin, oldest.weekStart, current.weekEnd),
      loadPayrollWeeks(admin, starts),
      loadBusinessWeeks(admin, starts),
      loadSupplierLines(admin, starts),
      loadBudgets(admin, starts),
      loadPayContext(admin),
    ]);
    // ✗ pay parts from the payments page (migration 047; none before it).
    const exRes = await admin.from("payroll_exclusions").select("week_start, employee_id, part").in("week_start", starts);
    const exclusions = new Set(
      ((exRes.error ? [] : exRes.data ?? []) as { week_start: string; employee_id: string; part: string }[]).map((x) =>
        exclusionKey(String(x.week_start).slice(0, 10), String(x.employee_id), String(x.part)),
      ),
    );

    const overview = buildMoneyOverview({
      current,
      settings,
      now,
      weeks,
      recent,
      since: sinceDate,
      orders,
      products,
      expenses,
      employees,
      shifts,
      payrollSnapshots: snapshots,
      businessWeeks,
      supplierLines,
      budgets,
      ctx,
      exclusions,
    });
    // The per-employee pay lines live on the payroll page; keep the response small.
    const strip = <T extends { payrollLines: unknown }>(w: T) => ({ ...w, payrollLines: [] });
    return NextResponse.json({
      ...overview,
      current: overview.current ? strip(overview.current) : null,
      recent: overview.recent.map(strip),
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    return serverError("money", e);
  }
}
