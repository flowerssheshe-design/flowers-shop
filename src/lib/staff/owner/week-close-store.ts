import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerSettings } from "@/lib/settings-server";
import { addDays } from "@/lib/staff/week";
import {
  ensureBusinessWeek,
  loadBudgets,
  loadEmployees,
  loadExpenses,
  loadOrders,
  loadPayContext,
  loadProducts,
  loadShifts,
  loadSupplierLines,
} from "./data";
import { ensureWeekClosed, type OpenWeekRow, type WeekCloseResult, type WeekCloseStore } from "./week-close";

type Admin = ReturnType<typeof createAdminClient>;

/** Inserts an archive row, dropping columns the live table doesn't have (same fallback as the old weekly reset). */
async function insertArchiveRow(admin: Admin, payload: Record<string, unknown>): Promise<string> {
  const attempt: Record<string, unknown> = { ...payload };
  const required = new Set(["week_start", "week_end"]);
  for (let i = 0; i < 40; i++) {
    const { data, error } = await admin.from("weekly_archives").insert(attempt).select("id").single();
    if (!error && data) return String((data as { id: string }).id);
    const msg = `${error?.message ?? ""} ${error?.details ?? ""}`;
    const missing = /column\s+["']?([a-z_0-9]+)["']?\s+(?:of\s+relation|does not exist)/i.exec(msg)?.[1]
      ?? /Could not find the '([a-z_0-9]+)' column/i.exec(msg)?.[1];
    if (missing && missing in attempt && !required.has(missing)) {
      delete attempt[missing];
      continue;
    }
    throw new Error(`weekly_archives: ${error?.message ?? "insert failed"}`);
  }
  throw new Error("weekly_archives: insert failed");
}

export function supabaseWeekCloseStore(admin: Admin): WeekCloseStore {
  return {
    ensureWeekRow: (weekStart, supplierOrderAt) => ensureBusinessWeek(admin, weekStart, supplierOrderAt),

    async openWeeksBefore(before) {
      const { data, error } = await admin
        .from("business_weeks")
        .select("week_start, archive_id, close_started_at, closed_at")
        .is("closed_at", null)
        .lt("week_start", before)
        .order("week_start", { ascending: true });
      if (error) throw new Error(`business_weeks: ${error.message}`);
      return (data ?? []) as OpenWeekRow[];
    },

    async claim(weekStart, now, staleBefore) {
      const { data, error } = await admin
        .from("business_weeks")
        .update({ close_started_at: now.toISOString() })
        .eq("week_start", weekStart)
        .is("closed_at", null)
        .or(`close_started_at.is.null,close_started_at.lt.${staleBefore.toISOString()}`)
        .select("week_start");
      if (error) throw new Error(`business_weeks: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async release(weekStart) {
      await admin.from("business_weeks").update({ close_started_at: null }).eq("week_start", weekStart).is("closed_at", null);
    },

    async finish(weekStart, archiveId, now) {
      const { error } = await admin
        .from("business_weeks")
        .update({ closed_at: now.toISOString(), archive_id: archiveId, close_started_at: null })
        .eq("week_start", weekStart);
      if (error) throw new Error(`business_weeks: ${error.message}`);
    },

    async loadWeekData(weekStart, window) {
      const [orders, products, expenses, employees, shifts, lines, bw, budgets, payContext] = await Promise.all([
        loadOrders(admin, window.from, window.to),
        loadProducts(admin),
        loadExpenses(admin),
        loadEmployees(admin),
        loadShifts(admin, weekStart, addDays(weekStart, 6)),
        loadSupplierLines(admin, [weekStart]),
        admin.from("business_weeks").select("supplier_ordered_at").eq("week_start", weekStart).maybeSingle(),
        loadBudgets(admin, [weekStart]),
        loadPayContext(admin, { strict: true }),
      ]);
      return {
        orders,
        products,
        expenses,
        employees,
        shifts,
        supplierLines: lines,
        supplierOrdered: Boolean((bw.data as { supplier_ordered_at?: string | null } | null)?.supplier_ordered_at),
        budget: budgets.get(weekStart),
        payContext,
      };
    },

    async findArchive(weekStartIso) {
      const { data } = await admin.from("weekly_archives").select("id").eq("week_start", weekStartIso).maybeSingle();
      return data ? String((data as { id: string }).id) : null;
    },

    insertArchive: (payload) => insertArchiveRow(admin, payload),

    async upsertPayroll(rows) {
      const { error } = await admin.from("payroll_weeks").upsert(rows, { onConflict: "week_start,employee_id" });
      if (error) throw new Error(`payroll_weeks: ${error.message}`);
    },

    async archiveOrders(ids) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await admin
          .from("orders")
          .update({ status: "archived" })
          .in("id", ids.slice(i, i + 200))
          .neq("status", "cancelled");
        if (error) throw new Error(`orders: ${error.message}`);
      }
    },

    async isSupplierOrdered(weekStart) {
      const { data } = await admin.from("business_weeks").select("supplier_ordered_at").eq("week_start", weekStart).maybeSingle();
      return Boolean((data as { supplier_ordered_at?: string | null } | null)?.supplier_ordered_at);
    },

    async resetLiveStock() {
      const { error } = await admin
        .from("inventory")
        .update({ live_stock_count: 0, initial_stock_count: 0, updated_at: new Date().toISOString() })
        .not("product_id", "is", null);
      if (error) throw new Error(`inventory: ${error.message}`);
    },
  };
}

/** Closes past weeks using the live DB. Used by the dashboard API and the cron route. */
export async function runWeekClose(now: Date = new Date()): Promise<WeekCloseResult> {
  const admin = createAdminClient();
  const settings = await getServerSettings();
  return ensureWeekClosed(supabaseWeekCloseStore(admin), settings, now);
}
