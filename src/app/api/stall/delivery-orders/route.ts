import { NextResponse } from "next/server";
import { requireStall } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const denied = requireStall();
  if (denied) return denied;

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
      .eq("delivery_type", "delivery")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "loading delivery orders failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ orders: (data as Order[]) ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}