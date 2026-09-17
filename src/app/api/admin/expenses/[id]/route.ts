import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.rpc("update_expense", {
      p_id: id,
      p_description: description.trim(),
      p_amount: amount,
      p_category: category.trim(),
      p_expense_type: expense_type,
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("update expense error:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "לא מוגדר" }, { status: 500 });
  }
  try {
    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.rpc("delete_expense", { p_id: id });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("delete expense error:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}