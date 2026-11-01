import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { getStoreModeInfo } from "@/lib/storeMode";
import { buildDashboard, weekWindow, type DashboardInput } from "@/lib/staff/owner/week-math";
import { runWeekClose } from "@/lib/staff/owner/week-close-store";
import { autoMarkSupplierOrderIfDue } from "@/lib/staff/owner/supplier-server";
import {
  ensureBusinessWeek,
  loadBudgets,
  loadBusinessWeeks,
  loadEmployees,
  loadExpenses,
  loadOrders,
  loadPayContext,
  loadProducts,
  loadShifts,
  loadStallStock,
  loadStalls,
  loadSupplierLines,
} from "@/lib/staff/owner/data";
import { notConfigured, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The live dashboard of the current business week ("השבוע עכשיו"). */
export async function GET() {
  const guard = await requireStaff("dashboard");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  const now = new Date();

  // Close any past week that is still open (idempotent, never blocks the page).
  let weekClose: { closed: string[]; errors: number } = { closed: [], errors: 0 };
  try {
    const r = await runWeekClose(now);
    await autoMarkSupplierOrderIfDue(createAdminClient(), now);
    weekClose = { closed: r.closed, errors: r.errors.length };
    if (r.errors.length) console.error("[staff/dashboard] week close errors:", r.errors);
  } catch (e) {
    console.error("[staff/dashboard] week close failed:", e);
    weekClose.errors = 1;
  }

  try {
    const admin = createAdminClient();
    const [settings, modeInfo] = await Promise.all([getServerSettings(), getStoreModeInfo(now)]);
    const week = modeInfo.week;
    const win = weekWindow(week, settings);
    await ensureBusinessWeek(admin, week.weekStart, week.supplierOrderAt);

    const [orders, products, expenses, employees, shifts, stalls, stallStock, lines, bw, budgets, ctx] = await Promise.all([
      loadOrders(admin, win.from, win.to),
      loadProducts(admin),
      loadExpenses(admin),
      loadEmployees(admin),
      loadShifts(admin, week.weekStart, week.weekEnd),
      loadStalls(admin),
      loadStallStock(admin),
      loadSupplierLines(admin, [week.weekStart]),
      loadBusinessWeeks(admin, [week.weekStart]),
      loadBudgets(admin, [week.weekStart]),
      loadPayContext(admin),
    ]);

    // ctx (pay history + one-off pay entries) goes to every payroll calculation.
    const dashboardInput: DashboardInput = {
      week,
      settings,
      now,
      orders,
      products,
      expenses,
      employees,
      shifts,
      stalls,
      stallStock,
      supplierLines: lines,
      supplierOrderedAt: bw[0]?.supplier_ordered_at ?? null,
      budget: budgets.get(week.weekStart),
      payContext: ctx,
    };
    const dashboard = buildDashboard(dashboardInput);

    return NextResponse.json({
      dashboard,
      storeMode: { mode: modeInfo.mode, setting: modeInfo.setting },
      weekClose,
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    return serverError("dashboard", e);
  }
}
