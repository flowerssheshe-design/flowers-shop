import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCourierOrPasscode } from "@/lib/admin-auth";
import type { Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const denied = requireCourierOrPasscode(req);
  if (denied) return denied;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("*")
      .eq("fulfillment_type", "delivery")
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "שגיאה בטעינת הזמנות" },
        { status: 500 },
      );
    }
    return NextResponse.json({ orders: (data as Order[]) ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
