import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import type { Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const store = cookies();
  if (store.get("flowers_courier_auth")?.value !== "1") {
    return NextResponse.json(
      { error: "????? ?????? ??????" },
      { status: 401 },
    );
  }

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
        { error: "????? ??????? ?????" },
        { status: 500 },
      );
    }
    return NextResponse.json({ orders: (data as Order[]) ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "????? ???" }, { status: 500 });
  }
}
