import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const store = cookies();
    if (store.get("flowers_stall_auth")?.value !== "1") {
      return NextResponse.json({ error: "נדרש זיהוי דוכן" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "נדרש זיהוי דוכן" }, { status: 401 });
  }

  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ orders: [] });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("*")
      .neq("status", "archived")
      .eq("status", "approved")
      .eq("delivery_type", "pickup")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "טעינת הזמנות נכשלה" },
        { status: 500 },
      );
    }
    return NextResponse.json({ orders: (data as Order[]) ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
