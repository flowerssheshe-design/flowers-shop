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
    const { description, amount, category, expense_type, expense_date, is_active } = body;
    if (!description?.trim() || typeof amount !== "number" || amount < 0 || !category?.trim() || !expense_type) {
      return NextResponse.json({ error: "נתונים חסרים או לא תקינים" }, { status: 400 });
    }
    if (expense_type !== "one_time" && expense_type !== "recurring") {
      return NextResponse.json({ error: "סוג הוצאה לא תקין" }, { status: 400 });
    }
    if (expense_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(expense_date))) {
      return NextResponse.json({ error: "תאריך הוצאה לא תקין" }, { status: 400 });
    }
    const admin = createAdminClient();
    // expense_date decides which week a one-time expense lands in, so it is
    // never optional for those; recurring expenses always start at creation.
    const { data, error } = await admin.rpc("add_expense", {
      p_description: description.trim(),
      p_amount: amount,
      p_category: category.trim(),
      p_expense_type: expense_type,
      p_expense_date: expense_date ?? null,
      p_is_active: is_active !== false,
    });
    if (error) throw error;
    return NextResponse.json({ id: data });
  } catch (e) {
    console.error("add expense error:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}