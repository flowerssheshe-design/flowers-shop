import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { Order, TopProduct, WeeklyArchive } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ archives: [], orders: [] });
  }
  const url = new URL(req.url);
  const archiveId = url.searchParams.get("id");
  const admin = createAdminClient();

  try {
    const { data: archives, error: aErr } = await admin
      .from("weekly_archives")
      .select("*")
      .order("week_start", { ascending: false });
    if (aErr) {
      return NextResponse.json({ error: "טעינת היסטוריה נכשלה" }, { status: 500 });
    }

    let orders: Order[] = [];
    if (archiveId) {
      const archive = (archives ?? []).find(
        (a) => (a as WeeklyArchive).id === archiveId,
      );
      if (archive) {
        const { data: ord } = await admin
          .from("orders")
          .select("*")
          .gte("created_at", (archive as WeeklyArchive).week_start)
          .lt("created_at", (archive as WeeklyArchive).week_end)
          .order("created_at", { ascending: false });
        orders = (ord as Order[]) ?? [];
      }
    }

    return NextResponse.json({
      archives: (archives as WeeklyArchive[]) ?? [],
      orders,
      topProducts: archives?.[0]
        ? ((archives[0] as WeeklyArchive).top_products as TopProduct[]) ?? []
        : [],
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}