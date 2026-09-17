import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { ExpensesSummary } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({
      expenses: [],
      expensesSummary: { total_one_time: 0, total_recurring: 0, total_all: 0 },
    });
  }
  try {
    const admin = createAdminClient();
    const [expensesRes, summaryRes] = await Promise.all([
      admin.rpc("list_expenses"),
      admin.rpc("expenses_summary"),
    ]);
    const expenses = expensesRes.data || [];
    const summary: ExpensesSummary = (summaryRes.data as ExpensesSummary[] | null)?.[0] ?? {
      total_one_time: 0,
      total_recurring: 0,
      total_all: 0,
    };
    return NextResponse.json({ expenses, expensesSummary: summary });
  } catch (e) {
    console.error("expenses list error:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "לא מוגדר" }, { status: 500 });
  }
  try {
    const body = await request.json();
    const { description, amount, category, expense_type } = body;
    if (!description?.trim() || typeof amount !== "number" || amount < 0 || !category?.trim() || !expense_type) {
      return NextResponse.json({ error: "נתונים חסרים או לא תקינים" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("add_expense", {
      p_description: description.trim(),
      p_amount: amount,
      p_category: category.trim(),
      p_expense_type: expense_type,
    });
    if (error) throw error;
    return NextResponse.json({ id: data });
  } catch (e) {
    console.error("add expense error:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}