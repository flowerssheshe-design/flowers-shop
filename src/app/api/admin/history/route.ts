import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { Order, TopProduct, WeeklyArchive } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const denied = requireAdmin();
  if (denied) return denied;
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
    let selectedTopProducts: TopProduct[] = [];
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
        selectedTopProducts =
          ((archive as WeeklyArchive).top_products as TopProduct[]) ?? [];
      }
    }

    return NextResponse.json({
      archives: (archives as WeeklyArchive[]) ?? [],
      orders,
      topProducts: archiveId
        ? selectedTopProducts
        : ((archives?.[0] as WeeklyArchive | undefined)?.top_products as
            | TopProduct[]
            | undefined) ?? [],
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}