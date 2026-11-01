import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { moneyStartDate } from "@/lib/staff/money-start";
import { currentBusinessWeek, israelDate } from "@/lib/staff/week";
import { expenseSummary, type ExpenseRow } from "@/lib/staff/owner/money";
import { notConfigured, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The small summary at the top of "הוצאות": total so far (one-time +
 * recurring × the weeks each was active), this week, this month, by category
 * and what the recurring expenses cost per week now.
 */
export async function GET() {
  const guard = await requireStaff("expenses");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  try {
    const now = new Date();
    const admin = createAdminClient();
    const settings = await getServerSettings();
    const week = currentBusinessWeek(settings, now);
    const { data, error } = await admin
      .from("expenses")
      .select("amount, category, expense_type, expense_date, creation_date, created_at, is_active");
    if (error) throw new Error(`expenses: ${error.message}`);
    const summary = expenseSummary((data ?? []) as ExpenseRow[], week.weekStart, israelDate(now), 520, moneyStartDate(settings));
    return NextResponse.json({ summary, weekStart: week.weekStart, weekEnd: week.weekEnd });
  } catch (e) {
    return serverError("expenses/summary", e);
  }
}
