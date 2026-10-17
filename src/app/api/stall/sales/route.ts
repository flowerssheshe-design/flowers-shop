import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { isStallSaleOrder } from "@/lib/utils";
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
    return NextResponse.json({ sales: [] });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("*")
      .neq("status", "archived")
      .in("delivery_type", ["pickup", "delivery"])
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "טעינת היסטוריית המכירות נכשלה" },
        { status: 500 },
      );
    }
    const sales = ((data as Order[]) ?? []).filter(isStallSaleOrder);
    return NextResponse.json({ sales });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
