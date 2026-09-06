import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { Product } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ products: [] });
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) {
      return NextResponse.json(
        { error: "????? ?????? ?????" },
        { status: 500 },
      );
    }
    return NextResponse.json({ products: (data as Product[]) ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "????? ???" }, { status: 500 });
  }
}
